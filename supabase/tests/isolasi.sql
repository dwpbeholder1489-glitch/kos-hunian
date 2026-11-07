-- Uji isolasi antar bisnis (blueprint 23.2): pengguna yang bukan anggota TIDAK boleh membaca atau mengubah data bisnis lain.
-- Jalankan di database uji: psql -v K=<id bisnis> -v U=<id pengguna luar> -f supabase/tests/isolasi.sql  (selalu di-ROLLBACK)
begin;
set local role authenticated;
select set_config('uji.kos', :'K', true), set_config('request.jwt.claim.sub', :'U', true), set_config('request.jwt.claims', json_build_object('sub', :'U', 'aal', 'aal1')::text, true);
create temp table hasil(uji text, lolos boolean) on commit drop;
grant all on hasil to authenticated;
do $$
declare t record; n bigint; k uuid := current_setting('uji.kos')::uuid; ok boolean;
begin
  -- 1) semua tabel ber-kos_id: tidak ada baris yang terbaca
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'kos_id' and tb.table_type = 'BASE TABLE' loop
    begin
      execute format('select count(*) from public.%I where kos_id = $1', t.table_name) into n using k;
      insert into hasil values ('baca ' || t.table_name, n = 0);
    exception when insufficient_privilege then insert into hasil values ('baca ' || t.table_name, true);
    end;
  end loop;
  select count(*) = 0 into ok from public.kos where id = k; insert into hasil values ('baca kos', ok);
  -- 2) RPC baca/tulis penting harus menolak
  for t in select * from (values
      ('retail_report', format('select public.retail_report(%L, current_date - 30, current_date)', k)),
      ('retail_ledger', format('select public.retail_ledger(%L)', k)),
      ('acct_report', format('select public.acct_report(%L, false, current_date - 30, current_date)', k)),
      ('kasir_catalog', format('select public.kasir_catalog(%L)', k)),
      ('team_list', format('select public.team_list(%L)', k)),
      ('business_export', format('select public.business_export(%L)', k)),
      ('recommendations', format('select public.recommendations(%L)', k)),
      ('stock_levels_list', format('select public.stock_levels_list(%L)', k)),
      ('sale_create', format('select public.sale_create(gen_random_uuid(), %L, ''ecer'', ''[{"product_id":"00000000-0000-0000-0000-000000000000","unit":"pcs","qty":1}]'', 0, ''tunai'')', k)),
      ('module_set', format('select public.module_set(%L, ''r_shift'', true, ''uji isolasi'')', k)),
      ('business_close', format('select public.business_close(%L, ''x'', ''uji isolasi'')', k)),
      ('svc_board', format('select public.svc_board(%L)', k)),
      ('svc_report', format('select public.svc_report(%L, current_date - 30, current_date)', k)),
      ('svc_order_create', format('select public.svc_order_create(gen_random_uuid(), %L, ''{"name":"x","lines":[]}'')', k)),
      ('svc_service_save', format('select public.svc_service_save(%L, null, ''{"name":"x","price":1}'')', k)),
      ('svc_stages_save', format('select public.svc_stages_save(%L, ''[]'')', k)),
      ('maint_create', format('select public.maint_create(gen_random_uuid(), %L, ''{"title":"uji isolasi"}'')', k)),
      ('utility_type_save', format('select public.utility_type_save(%L, null, ''{"name":"Uji","price":1}'')', k)),
      ('lease_set_end', format('select public.lease_set_end((select id from public.leases where kos_id = %L limit 1), null)', k)),
      ('bb_validate', format('select public.bb_validate(%L)', k)),
      ('bb_dashboard', format('select public.bb_dashboard(%L)', k)),
      ('bb_object_save', format('select public.bb_object_save(%L, null, ''{"name":"uji"}'')', k)),
      ('bb_finance', format('select public.bb_finance(%L, current_date - 30, current_date)', k)),
      ('cf_get', format('select public.cf_get(%L, ''occupant'', gen_random_uuid())', k)),
      ('cf_field_save', format('select public.cf_field_save(%L, null, ''{"entity":"occupant","label":"x","type":"text"}'')', k)),
      ('att_list', format('select public.att_list(''occupant'', (select id from public.occupants where kos_id = %L limit 1))', k)),
      ('att_prepare', format('select public.att_prepare(''expense'', (select id from public.expenses where kos_id = %L limit 1), ''x.jpg'', ''image/jpeg'', 10)', k)),
      ('att_purge_list', 'select public.att_purge_list(10)'),
      ('setup_state', format('select public.setup_state(%L)', k)),
      ('setup_item_save', format('select public.setup_item_save(%L, ''alamat'', ''{"v":"dibajak"}'', ''simpan'')', k)),
      ('setup_activate', format('select public.setup_activate(%L)', k)),
      ('setup_business_action', format('select public.setup_business_action(%L, ''tolak'', ''uji isolasi'')', k)),
      ('setup_add_service', format('select public.setup_add_service(%L, ''{"name":"uji"}'')', k)),
      ('bb_people', format('select public.bb_people(%L)', k)),
      ('booking_create', format('select public.booking_create(gen_random_uuid(), %L, ''{"name":"uji"}'')', k)),
      ('meter_record', format('select public.meter_record(%L, (select id from public.utility_types where kos_id = %L limit 1), current_date, current_date, ''[]'')', k, k))
    ) v(name, q) loop
    begin
      execute t.q;
      insert into hasil values ('rpc ' || t.name, false);
    exception when others then insert into hasil values ('rpc ' || t.name, true);
    end;
  end loop;
  -- 3) tulis langsung ke tabel
  begin
    update public.kos set name = 'dibajak' where id = k;
    get diagnostics n = row_count; insert into hasil values ('ubah kos', n = 0);
  exception when others then insert into hasil values ('ubah kos', true); end;
end $$;
select case when bool_and(lolos) then 'LULUS' else 'GAGAL' end as status, count(*) as jumlah_uji, count(*) filter (where not lolos) as gagal,
       string_agg(uji, ', ') filter (where not lolos) as yang_gagal from hasil;
rollback;
