-- 21 Nov 2026 (keputusan pemilik): Integrasi & Gabungan bisnis = Paket Pro, ekspor gabungan dibuat.
-- Sekaligus perbaikan galat "column reference x is ambiguous" di Alur kerja › Saran (workflow_recommendations, bagian R9).
--  • Fitur baru `integrasi` & `gabungan_bisnis` hanya di Paket Pro (fitur BARU → tanpa pengecualian bisnis lama).
--  • Integrasi: membuat sambungan, kode baru, dan mengaktifkan lagi butuh Pro; jeda/hapus/riwayat tetap boleh
--    (pemilik tidak boleh terkunci dari datanya sendiri). Webhook ke bisnis yang tidak lagi Pro ditolak & dicatat.
--  • Gabungan bisnis: disimpan/ditampilkan bila minimal satu bisnis yang digabung berpaket Pro.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ---------- 1) Perbaikan Alur kerja › Saran ----------
select public._prasara_patch('public.workflow_recommendations(uuid)',
  'select x into p from business_processes bp, jsonb_array_elements(bp.steps) x where bp.code = pm->>''code'' and x->>''key'' = s->>''key'';',
  'select e into p from business_processes bp, jsonb_array_elements(bp.steps) e where bp.code = pm->>''code'' and e->>''key'' = s->>''key'';');

-- ---------- 2) Kode fitur Pro ----------
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{integrasi,gabungan_bisnis}'::text[]) f)
where v.plan_key = 'pro' and v.id = (public.plan_current(v.plan_key)).id;

create or replace function public.plan_feature_codes()
returns text[] language sql immutable as $$
  select array['laporan_lengkap', 'ekspor', 'kwitansi', 'pengingat_email', 'portal_penghuni', 'email_toko',
               'portal_bisnis', 'jurnal_manual', 'anggaran', 'rekonsiliasi', 'laporan_lanjutan', 'persetujuan', 'otomatisasi',
               'akses_modul', 'akses_granular', 'persetujuan_bertingkat', 'otomatisasi_lanjutan', 'analisis_lanjutan', 'analisis_mendalam',
               'integrasi', 'gabungan_bisnis'];
$$;

-- ---------- 3) Integrasi = Pro ----------
select public._prasara_patch('public.integ_create(uuid,text,text,jsonb)',
  '  perform integ_guard(p_kos);
  if not exists',
  '  perform integ_guard(p_kos);
  if not plan_has(p_kos, ''integrasi'') then raise exception ''BATAS_PAKET: Integrasi (formulir website & aplikasi lain) tersedia di Paket Pro.''; end if;
  if not exists');
select public._prasara_patch('public.integ_rotate(uuid)',
  '  perform integ_guard(c.kos_id);
  v_tok := integ_new_token();',
  '  perform integ_guard(c.kos_id);
  if not plan_has(c.kos_id, ''integrasi'') then raise exception ''BATAS_PAKET: Membuat kode baru butuh Paket Pro. Sambungan tetap bisa dijeda atau dihapus.''; end if;
  v_tok := integ_new_token();');
select public._prasara_patch('public.integ_set_status(uuid,boolean)',
  '  perform integ_guard(c.kos_id);
  update integration_connections',
  '  perform integ_guard(c.kos_id);
  if p_active and not plan_has(c.kos_id, ''integrasi'') then raise exception ''BATAS_PAKET: Mengaktifkan sambungan butuh Paket Pro.''; end if;
  update integration_connections');
select public._prasara_patch('public.hook_inbound(text,text,jsonb,text)',
  '  if not module_on(k.id, ''u_crm'') then',
  '  if not plan_has(k.id, ''integrasi'') then
    if not exists (select 1 from integration_logs where connection_id = c.id and outcome = ''nonaktif'' and created_at > now() - interval ''10 minutes'') then
      insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, ''nonaktif'', ''Paket bisnis tidak lagi mencakup Integrasi (Paket Pro)'', p_ip_hash); end if;
    return jsonb_build_object(''ok'', false, ''status'', 403, ''error'', ''Integrasi tidak aktif untuk bisnis ini.'');
  end if;
  if not module_on(k.id, ''u_crm'') then');
select public._prasara_patch('public.integ_overview(uuid)',
  '''crm_on'', module_on(p_kos, ''u_crm''));',
  '''crm_on'', module_on(p_kos, ''u_crm''), ''allowed'', plan_has(p_kos, ''integrasi''));');

-- ---------- 4) Gabungan bisnis = Pro ----------
-- portfolio_get: + allowed (ada bisnis Pro di gabungan) + pro (bisnis akun ini yang Pro & boleh dipilih)
create or replace function public.portfolio_get()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_raw uuid[]; v_out uuid[] := '{}'; v_id uuid; v_pro uuid[];
begin
  if auth.uid() is null then return jsonb_build_object('include', '[]'::jsonb, 'pro', '[]'::jsonb, 'allowed', false); end if;
  select include into v_raw from public.portfolio_settings where user_id = auth.uid();
  foreach v_id in array coalesce(v_raw, '{}') loop
    if exists (select 1 from kos k join kos_members km on km.kos_id = k.id and km.user_id = auth.uid() and km.active
               where k.id = v_id and k.suspended_at is null)
       and member_in('finance', v_id) then
      v_out := v_out || v_id;
    end if;
  end loop;
  select coalesce(array_agg(k.id), '{}') into v_pro
  from kos k join kos_members km on km.kos_id = k.id and km.user_id = auth.uid() and km.active
  where k.suspended_at is null and plan_has(k.id, 'gabungan_bisnis') and member_in('finance', k.id);
  return jsonb_build_object('include', to_jsonb(v_out), 'pro', to_jsonb(v_pro), 'allowed', v_out && v_pro);
end $$;

select public._prasara_patch('public.portfolio_set(uuid[])',
  '  insert into public.portfolio_settings',
  '  if coalesce(array_length(v_ids, 1), 0) > 0 and not exists (select 1 from unnest(v_ids) i where plan_has(i, ''gabungan_bisnis'')) then
    raise exception ''BATAS_PAKET: Gabungan bisnis tersedia di Paket Pro — minimal satu bisnis yang digabung harus berpaket Pro.'';
  end if;
  insert into public.portfolio_settings');

-- ---------- 5) Penawaran (growth) ----------
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA', 'REPORT.ADVANCED_REQUESTED', 'PORTAL.PUBLIC_PAGE.REQUESTED',
    'PORTAL.CATALOG.REQUESTED', 'PORTAL.REGISTRATION.REQUESTED', 'PORTAL.BOOKING.REQUESTED', 'PORTAL.SYNC.REQUESTED',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'FINANCE.RECONCILIATION_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED',
    'ACCESS.MODULE.REQUESTED', 'ACCESS.GRANULAR.REQUESTED', 'APPROVAL.MULTILEVEL.REQUESTED', 'WORKFLOW.ADVANCED.REQUESTED',
    'ANALYTICS.ADVANCED.REQUESTED', 'ANALYTICS.MULTI_BRANCH.REQUESTED', 'INTEGRATION.REQUESTED', 'PORTFOLIO.CONSOLIDATION.REQUESTED'));
select public._prasara_patch('public.growth_event_feature(text)',
  'when ''ANALYTICS.MULTI_BRANCH.REQUESTED'' then ''analisis_mendalam'' end;',
  'when ''ANALYTICS.MULTI_BRANCH.REQUESTED'' then ''analisis_mendalam''
    when ''INTEGRATION.REQUESTED'' then ''integrasi'' when ''PORTFOLIO.CONSOLIDATION.REQUESTED'' then ''gabungan_bisnis'' end;');

insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.INTEGRATION.' || upper(p.k), 'Integrasi formulir & aplikasi (' || p.n || ')', 'fitur', 'upgrade', p.k, 'pro', 1, 'INTEGRATION.REQUESTED',
  'Kiriman formulir website langsung jadi Prospek.',
  'Paket Pro menyambungkan formulir website, Zapier, Make, n8n, Apps Script, atau bot Anda ke PRASARA — setiap kiriman otomatis masuk menu Prospek lengkap dengan riwayatnya.',
  'Upgrade ke Paket Pro', 'Nanti saja', 25, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar'), ('bisnis', 'Bisnis')) as p(k, n)
on conflict (id) do nothing;
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.PORTFOLIO.' || upper(p.k), 'Gabungan beberapa bisnis (' || p.n || ')', 'fitur', 'upgrade', p.k, 'pro', 1, 'PORTFOLIO.CONSOLIDATION.REQUESTED',
  'Lihat jumlah semua bisnis Anda dalam satu angka.',
  'Paket Pro menjumlahkan pendapatan, laba, dan uang yang belum diterima dari bisnis yang Anda pilih, membandingkannya dengan bulan lalu, memisahkannya per badan usaha, dan bisa diunduh sebagai Excel.',
  'Upgrade ke Paket Pro', 'Nanti saja', 25, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar'), ('bisnis', 'Bisnis')) as p(k, n)
on conflict (id) do nothing;

drop function public._prasara_patch(text, text, text);
