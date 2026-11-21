-- Uji isolasi antar bisnis (blueprint 23.2): pengguna yang bukan anggota TIDAK boleh membaca atau mengubah data bisnis lain.
-- Jalankan di database uji: psql -v K=<id bisnis> -v U=<id pengguna luar> -f supabase/tests/isolasi.sql  (selalu di-ROLLBACK)
begin;
-- id catatan kasir offline milik bisnis target (dibaca sebelum berganti peran) untuk uji kirim ulang/tandai
select set_config('uji.off', coalesce((select id::text from public.pos_offline where kos_id = :'K' and status <> 'tersimpan' limit 1), gen_random_uuid()::text), true),
       set_config('uji.off_ok', coalesce((select id::text from public.pos_offline where kos_id = :'K' limit 1), gen_random_uuid()::text), true);
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
      ('lease_first_due', format('select public.lease_first_due((select id from public.leases where kos_id = %L limit 1), null)', k)),
      ('lease_move_room', format('select public.lease_move_room((select id from public.leases where kos_id = %L limit 1), ''{}'')', k)),
      ('so_save', format('select public.so_save(gen_random_uuid(), %L, ''{"lines":[]}'')', k)),
      ('price_list_save', format('select public.price_list_save(%L, null, ''uji'')', k)),
      ('reorder_suggest', format('select public.reorder_suggest(%L)', k)),
      ('product_save', format('select public.product_save(%L, null, ''uji'', ''kg'', 0, 0, ''[{"name":"kg"}]'')', k)),
      ('unit_to_base', format('select public.unit_to_base((select id from public.products where kos_id = %L limit 1), ''kg'', 1)', k)),
      ('asset_list', format('select public.asset_list(%L)', k)),
      ('asset_save', format('select public.asset_save(%L, null, ''{"name":"uji","mode":"awal","cost":1000}'')', k)),
      ('recipe_overview', format('select public.recipe_overview(%L)', k)),
      ('food_cost_report', format('select public.food_cost_report(%L, current_date - 30, current_date)', k)),
      ('promo_list', format('select public.promo_list(%L)', k)),
      ('preq_list', format('select public.preq_list(%L)', k)),
      ('consign_overview', format('select public.consign_overview(%L)', k)),
      ('retail_kpi', format('select public.retail_kpi(%L, current_date, current_date)', k)),
      ('day_close_summary', format('select public.day_close_summary(%L, current_date)', k)),
      ('day_close', format('select public.day_close(%L, current_date)', k)),
      ('day_close_list', format('select public.day_close_list(%L)', k)),
      ('category_save', format('select public.category_save(%L, null, ''uji'')', k)),
      ('stock_avail', format('select public.stock_avail(%L)', k)),
      ('stock_health', format('select public.stock_health(%L)', k)),
      -- Tahap 1 Retail: tata kelola harga & kredit
      ('price_history_list', format('select public.price_history_list(%L)', k)),
      ('kasbon_check', format('select public.kasbon_check(%L, (select id from public.contacts where kos_id = %L limit 1), 1000)', k, k)),
      ('price_policy_set', format('select public.price_policy_set(%L, 10, null)', k)),
      ('outlet_price_set', format('select public.outlet_price_set(%L, gen_random_uuid(), gen_random_uuid(), ''pcs'', 1, null)', k)),
      ('price_list_dates_set', format('select public.price_list_dates_set(coalesce((select id from public.price_lists where kos_id = %L limit 1), gen_random_uuid()), null, null)', k)),
      ('customer_profile_set', format('select public.customer_profile_set(coalesce((select id from public.contacts where kos_id = %L limit 1), gen_random_uuid()), null, null)', k)),
      -- Tahap 2 Retail: akuntansi dagang
      ('acct_trial_balance', format('select public.acct_trial_balance(%L, current_date - 30, current_date)', k)),
      ('aging_report', format('select public.aging_report(%L, ''utang'')', k)),
      ('inventory_valuation', format('select public.inventory_valuation(%L)', k)),
      ('wholesale_kpi', format('select public.wholesale_kpi(%L, current_date - 30, current_date)', k)),
      -- Tahap 3 Retail: katalog lanjutan
      ('brand_save', format('select public.brand_save(%L, null, ''Dibajak'')', k)),
      ('brand_report', format('select public.brand_report(%L, current_date - 30, current_date)', k)),
      ('product_set_brand', format('select public.product_set_brand(array[(select id from public.products where kos_id = %L limit 1)], null)', k)),
      ('barcode_find', format('select public.barcode_find(%L, ''123'')', k)),
      ('unit_barcodes_set', format('select public.unit_barcodes_set((select id from public.products where kos_id = %L limit 1), ''pcs'', array[''999999''])', k)),
      ('supplier_items_for', format('select public.supplier_items_for(%L)', k)),
      ('supplier_item_save', format('select public.supplier_item_save(%L, gen_random_uuid(), gen_random_uuid(), ''pcs'', 1, null)', k)),
      ('kit_overview', format('select public.kit_overview(%L)', k)),
      ('kit_save', format('select public.kit_save((select id from public.products where kos_id = %L limit 1), ''[]'')', k)),
      ('serial_list', format('select public.serial_list(%L)', k)),
      ('serial_lookup', format('select public.serial_lookup(%L, ''SN'')', k)),
      ('serial_add', format('select public.serial_add(%L, (select id from public.products where kos_id = %L limit 1), array[''X1''])', k, k)),
      ('claims_list', format('select public.claims_list(%L)', k)),
      ('sale_serials', format('select public.sale_serials((select id from public.sales where kos_id = %L limit 1))', k)),
      ('credit_notes_list', format('select public.credit_notes_list(%L)', k)),
      ('credit_note_check', format('select public.credit_note_check(%L, ''NK-1'')', k)),
      ('credit_note_policy_set', format('select public.credit_note_policy_set(%L, 30)', k)),
      -- Tahap 4 Retail: kasir offline
      ('pos_offline_submit', format('select public.pos_offline_submit(%L, jsonb_build_object(''id'', gen_random_uuid(), ''client_at'', now(), ''lines'', ''[]''::jsonb))', k)),
      ('pos_offline_submit_ulang', format('select public.pos_offline_submit(%L, jsonb_build_object(''id'', %L, ''client_at'', now()))', k, current_setting('uji.off_ok'))),
      ('pos_offline_list', format('select public.pos_offline_list(%L)', k)),
      ('pos_offline_review', format('select public.pos_offline_review(%L)', current_setting('uji.off'))),
      ('hold_list', format('select public.hold_list(%L)', k)),
      ('hold_create', format('select public.hold_create(%L, (select id from public.products where kos_id = %L limit 1), null, 1, ''rusak'')', k, k)),
      ('stock_transfer_send', format('select public.stock_transfer_send(gen_random_uuid(), %L, null, null, ''[]'', null)', k)),
      ('commission_report', format('select public.commission_report(%L, current_date - 30, current_date)', k)),
      ('commission_rule_save', format('select public.commission_rule_save(%L, null, null, 1)', k)),
      ('commission_to_payroll', format('select public.commission_to_payroll(%L, current_date)', k)),
      ('stock_policy_set', format('select public.stock_policy_set(%L, ''tolak'')', k)),
      ('loss_watch', format('select public.loss_watch(%L, current_date - 30, current_date)', k)),
      ('price_breaks_set', format('select public.price_breaks_set((select id from public.products where kos_id = %L limit 1), ''pcs'', ''[]'')', k)),
      ('variant_save', format('select public.variant_save(%L, null, ''uji'', null, ''{"base":"pcs"}'', ''[{"label":"a"}]'')', k)),
      ('consign_doc_create', format('select public.consign_doc_create(gen_random_uuid(), %L, ''terima'', gen_random_uuid(), ''[]'')', k)),
      ('preq_create', format('select public.preq_create(gen_random_uuid(), %L, ''[]'')', k)),
      ('sinv_list', format('select public.sinv_list(%L)', k)),
      ('supplier_scorecard', format('select public.supplier_scorecard(%L)', k)),
      ('promo_preview', format('select public.promo_preview(%L, ''ecer'', ''[]'')', k)),
      ('promo_save', format('select public.promo_save(%L, null, ''{"name":"uji","kind":"diskon","percent":10}'')', k)),
      ('staff_save', format('select public.staff_save(%L, null, ''{"name":"uji isolasi"}'')', k)),
      ('staff_me', format('select public.staff_me(%L)', k)),
      ('attendance_clock', format('select public.attendance_clock(%L, ''masuk'', null)', k)),
      ('attendance_set', format('select public.attendance_set(%L, ''{}'')', k)),
      ('shift_plan_set', format('select public.shift_plan_set(%L, ''{}'')', k)),
      ('payroll_draft', format('select public.payroll_draft(%L, current_date)', k)),
      ('attendance_summary', format('select public.attendance_summary(%L, current_date - 30, current_date)', k)),
      ('staff_advance_add', format('select public.staff_advance_add(%L, gen_random_uuid(), 1000, ''kas'', null, null)', k)),
      ('customer_credit', format('select public.customer_credit((select id from public.contacts where kos_id = %L limit 1))', k)),
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
      ('svc_logistics', format('select public.svc_logistics(%L)', k)),
      ('svc_dashboard', format('select public.svc_dashboard(%L)', k)),
      ('svc_zone_save', format('select public.svc_zone_save(%L, null, ''{"name":"uji isolasi"}'')', k)),
      ('svc_slot_save', format('select public.svc_slot_save(%L, null, ''{"label":"08-10"}'')', k)),
      ('lead_check', format('select public.lead_check((select id from public.crm_leads where kos_id = %L limit 1))', k)),
      ('logo_prepare', format('select public.logo_prepare(%L)', k)),
      ('logo_set', format('select public.logo_set(%L, null)', k)),
      ('bb_people', format('select public.bb_people(%L)', k)),
      ('booking_create', format('select public.booking_create(gen_random_uuid(), %L, ''{"name":"uji"}'')', k)),
      ('meter_record', format('select public.meter_record(%L, (select id from public.utility_types where kos_id = %L limit 1), current_date, current_date, ''[]'')', k, k)),
      ('integ_overview', format('select public.integ_overview(%L)', k)),
      ('integ_create', format('select public.integ_create(%L, ''webhook_masuk'', ''Dibajak'')', k)),
      ('integ_logs', format('select public.integ_logs(%L)', k)),
      ('exp_performance', format('select public.exp_performance(%L, 30)', k))
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
