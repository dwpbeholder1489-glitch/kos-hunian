-- Portal bisnis hanya Paket Pro (Master Prompt V2 §4.1 & catatan: "Portal hanya tersedia pada Pro. Jangan memberikan
-- Portal kepada Dasar atau Bisnis", §5.1 "Jangan memberikan akses Portal melalui trial Dasar").
-- Portal bisnis = halaman bisnis publik /b/[slug] beserta katalog, formulir permintaan, pendaftaran penghuni online,
-- pesanan langsung, QR meja, dan reservasi (semua hanya melayani halaman yang `enabled`).
-- Keputusan pemilik 14 Nov 2026 (seperti fitur lain): dikunci HANYA untuk bisnis baru → bisnis lama tetap (legacy_features).
--  • Tidak bisa MENERBITKAN halaman tanpa fitur (trigger di public_pages → semua jalur: menu Halaman, Bagikan, setup).
--    Saat setup otomatis halaman tetap disimpan tetapi tidak diterbitkan (aktivasi tidak gagal).
--  • Turun paket: portal_unpublish_lapsed() (jadwal harian) menyembunyikan halaman bisnis yang tidak berhak lagi.
--    Data halaman tidak dihapus; terbit lagi setelah naik paket.

update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{portal_bisnis}'::text[]) f)
where v.plan_key = 'pro' and v.id = (public.plan_current(v.plan_key)).id;
update public.kos set legacy_features = (select array_agg(distinct f order by f) from unnest(legacy_features || '{portal_bisnis}'::text[]) f)
where created_at < now() and not ('portal_bisnis' = any(legacy_features));

create or replace function public.public_pages_portal_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.enabled or (tg_op = 'UPDATE' and old.enabled) then return new; end if;    -- hanya saat menerbitkan
  if plan_has(new.kos_id, 'portal_bisnis') then return new; end if;
  if coalesce(current_setting('prasara.setup_ok', true), '') = '1' then new.enabled := false; return new; end if;   -- setup: simpan saja
  if auth.uid() is null then return new; end if;                                                                   -- sistem/admin server
  raise exception 'BATAS_PAKET: Halaman bisnis publik (Portal: katalog, pendaftaran & pemesanan online) tersedia di Paket Pro. Isi halaman tetap tersimpan.';
end $$;
drop trigger if exists public_pages_portal on public.public_pages;
create trigger public_pages_portal before insert or update of enabled on public.public_pages
  for each row execute function public.public_pages_portal_guard();

-- Jadwal harian: halaman bisnis yang tidak berhak lagi (turun paket / masa aktif habis) disembunyikan
create or replace function public.portal_unpublish_lapsed()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public_pages pg set enabled = false
  from kos k
  where k.id = pg.kos_id and pg.enabled and k.closed_at is null and not plan_has(k.id, 'portal_bisnis');
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.portal_unpublish_lapsed() from public, anon, authenticated;
grant execute on function public.portal_unpublish_lapsed() to service_role;
revoke execute on function public.public_pages_portal_guard() from public, anon, authenticated;

-- Growth: penawaran Pro saat pemilik (Gratis/Dasar/Bisnis) ingin menerbitkan halaman bisnis
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA', 'REPORT.ADVANCED_REQUESTED', 'PORTAL.PUBLIC_PAGE.REQUESTED',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'FINANCE.RECONCILIATION_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED'));
create or replace function public.growth_event_feature(p_event text)
returns text language sql immutable as $$
  select case p_event when 'FINANCE.MANUAL_JOURNAL_REQUESTED' then 'jurnal_manual' when 'FINANCE.RECONCILIATION_REQUESTED' then 'rekonsiliasi'
    when 'BUDGET.CREATE_REQUESTED' then 'anggaran' when 'TRANSACTION.APPROVAL_REQUESTED' then 'persetujuan' when 'WORKFLOW.REQUESTED' then 'otomatisasi'
    when 'REPORT.ADVANCED_REQUESTED' then 'laporan_lanjutan' when 'PORTAL.PUBLIC_PAGE.REQUESTED' then 'portal_bisnis' end;
$$;
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.PORTAL.PAGE.' || upper(p.k), 'Terbitkan halaman bisnis (' || p.n || ')', 'fitur', 'upgrade', p.k, 'pro', 1, 'PORTAL.PUBLIC_PAGE.REQUESTED',
  'Bisnis Anda siap go digital.',
  'Gunakan Portal PRASARA untuk menampilkan katalog, menerima pendaftaran, dan mengelola pemesanan pelanggan secara online. Portal tersedia di Paket Pro.',
  'Upgrade ke Paket Pro', 'Nanti saja', 20, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar'), ('bisnis', 'Bisnis')) as p(k, n)
on conflict (id) do nothing;
