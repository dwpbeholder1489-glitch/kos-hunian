-- Retensi & Growth Analytics lengkap (Master Prompt V2 §11–12).
--  1) cancel_reasons + plan_cancel_reason: alasan berhenti memperpanjang, OPSIONAL dan ditanyakan SESUDAH
--     pembatalan berhasil (tanpa dark pattern; pembatalan tidak bergantung pada jawaban).
--  2) site_visits + site_visit: jumlah kunjungan halaman publik per hari (tanpa data pribadi, tanpa ID pengunjung).
--  3) growth_analytics: tambah transaksi pertama, konversi daftar, Gratis→bayar, churn/pembatalan/tidak aktif,
--     pendapatan per paket/promosi/perpanjangan. Perpanjangan dihitung dari riwayat aktivasi (sebelumnya bisnis
--     yang memperpanjang tepat waktu tidak terhitung karena masa bayarnya sudah bergeser ke depan).

-- ---------- 1) Alasan pembatalan ----------
create table if not exists public.cancel_reasons (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  plan text,
  reason text not null check (reason in ('harga', 'fitur_kurang', 'jarang_dipakai', 'sulit_dipakai', 'tutup_usaha', 'pindah_aplikasi', 'sementara', 'lainnya')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists cancel_reasons_at on public.cancel_reasons(created_at desc);
alter table public.cancel_reasons enable row level security;   -- tanpa policy: hanya lewat fungsi
drop trigger if exists zz_kos_open_guard on public.cancel_reasons;
create trigger zz_kos_open_guard before insert or update or delete on public.cancel_reasons
  for each row execute function public.kos_open_guard();

create or replace function public.plan_cancel_reason(p_kos uuid, p_reason text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  if not (select cancel_at_end from kos where id = p_kos) then raise exception 'Langganan ini tidak sedang dihentikan'; end if;
  -- satu jawaban per pembatalan (dalam 1 hari); jawaban ulang memperbarui yang terakhir
  update cancel_reasons set reason = p_reason, note = nullif(trim(coalesce(p_note, '')), '')
   where id = (select id from cancel_reasons where kos_id = p_kos and created_at > now() - interval '1 day' order by created_at desc limit 1);
  if not found then
    insert into cancel_reasons(kos_id, user_id, plan, reason, note)
    values (p_kos, auth.uid(), kos_plan(p_kos), p_reason, nullif(trim(coalesce(p_note, '')), ''));
  end if;
end $$;

-- ---------- 2) Kunjungan halaman publik ----------
create table if not exists public.site_visits (
  day date not null,
  path text not null check (path in ('/', '/panduan', '/tentang', '/masuk', '/mulai')),
  n int not null default 0 check (n >= 0),
  primary key (day, path)
);
alter table public.site_visits enable row level security;   -- tanpa policy

create or replace function public.site_visit(p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_path not in ('/', '/panduan', '/tentang', '/masuk', '/mulai') then return; end if;
  insert into site_visits(day, path, n) values ((now() at time zone 'Asia/Jakarta')::date, p_path, 1)
  on conflict (day, path) do update set n = site_visits.n + 1;
end $$;

-- ---------- 3) Analitik ----------
create or replace function public.growth_analytics(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_since_d date;
  v_coba int; v_coba_bayar int; v_bayar int; v_mrr numeric; v_aktif int;
  v_berakhir int; v_diperpanjang int; v_batal int; v_tidak_aktif int;
  v_pemilik int; v_bisnis_baru int; v_bisnis_aktif int; v_pengunjung int; v_trx_pertama int;
begin
  if not admin_can('finance.view') then raise exception 'Tidak punya izin melihat pertumbuhan'; end if;
  v_since := now() - make_interval(days => v_days);
  v_since_d := v_since::date;

  select count(*) into v_coba from kos where trial_until is not null and activated_at >= v_since;
  select count(*) into v_coba_bayar from kos k where k.trial_until is not null and k.activated_at >= v_since
    and exists (select 1 from plan_activations pa where pa.kos_id = k.id and pa.months > 0);
  select count(distinct kos_id) into v_bayar from plan_activations where created_at >= v_since and months > 0;

  select count(*) into v_aktif from kos k where k.paid_until >= v_today and k.plan in ('dasar', 'bisnis', 'pro') and k.closed_at is null;

  select coalesce(sum(
      case when (select pa.months from plan_activations pa where pa.kos_id = k.id order by pa.created_at desc limit 1) = 12
           then coalesce((select t.price from plan_terms t where t.plan_key = k.plan and t.months = 12 and t.active), plan_unit_price(k.id, k.plan)) / 12
           else plan_unit_price(k.id, k.plan) end), 0)
    into v_mrr
  from kos k where k.paid_until >= v_today and k.plan in ('dasar', 'bisnis', 'pro') and k.closed_at is null;

  -- Perpanjangan dari riwayat aktivasi: setiap masa bayar yang jatuh tempo dalam periode (sudah lewat),
  -- diperpanjang bila ada aktivasi berbayar lain sesudah aktivasi itu dibuat dan paling lambat 3 hari setelah jatuh tempo.
  with due as (
    select distinct on (a.kos_id, a.active_until) a.kos_id, a.active_until, a.created_at
    from plan_activations a join kos k on k.id = a.kos_id
    where a.months > 0 and a.active_until >= v_since_d and a.active_until < v_today and k.closed_at is null
      and not is_admin_owner(a.kos_id)
    order by a.kos_id, a.active_until, a.created_at
  )
  select count(*), count(*) filter (where exists (
           select 1 from plan_activations b where b.kos_id = due.kos_id and b.months > 0
             and b.created_at > due.created_at and b.created_at::date <= due.active_until + 3))
    into v_berakhir, v_diperpanjang from due;

  select count(distinct kos_id) into v_batal from admin_log where action = 'batal_langganan' and created_at >= v_since;

  -- Pelanggan aktif tanpa transaksi apa pun 14 hari terakhir (penjualan, pembayaran, pesanan jasa, pengeluaran)
  select count(*) into v_tidak_aktif from kos k
  where k.paid_until >= v_today and k.plan in ('dasar', 'bisnis', 'pro') and k.closed_at is null
    and not exists (select 1 from sales s where s.kos_id = k.id and s.sold_at > now() - interval '14 days')
    and not exists (select 1 from payments p where p.kos_id = k.id and p.created_at > now() - interval '14 days')
    and not exists (select 1 from svc_orders o where o.kos_id = k.id and o.created_at > now() - interval '14 days')
    and not exists (select 1 from expenses e where e.kos_id = k.id and e.created_at > now() - interval '14 days');

  select count(distinct user_id) into v_pemilik from kos_members where role = 'pemilik' and added_at >= v_since;
  select count(*) into v_bisnis_baru from kos where created_at >= v_since;
  select count(*) into v_bisnis_aktif from kos where activated_at >= v_since;
  select nullif(coalesce(sum(n), 0), 0) into v_pengunjung from site_visits where path = '/' and day >= v_since_d;
  select count(*) into v_trx_pertama from kos k where k.created_at >= v_since
    and (exists (select 1 from sales s where s.kos_id = k.id)
      or exists (select 1 from payments p where p.kos_id = k.id and p.status = 'terverifikasi')
      or exists (select 1 from svc_orders o where o.kos_id = k.id));

  return jsonb_build_object(
    'hari', v_days,
    'akuisisi', jsonb_build_object(
      'pemilik_baru', v_pemilik,
      'bisnis_baru', v_bisnis_baru,
      'pengunjung', v_pengunjung,
      'kunjungan_halaman', (select coalesce(jsonb_object_agg(path, total), '{}'::jsonb) from (
          select path, sum(n) total from site_visits where day >= v_since_d group by path) q),
      'rasio_daftar', case when v_pengunjung > 0 then round(v_pemilik::numeric * 100 / v_pengunjung, 1) end),
    'aktivasi', jsonb_build_object(
      'bisnis_aktif', v_bisnis_aktif,
      'masa_coba', v_coba,
      'transaksi_pertama', v_trx_pertama,
      'rasio_aktivasi', case when v_bisnis_baru > 0 then round(v_bisnis_aktif::numeric * 100 / v_bisnis_baru, 1) end),
    'konversi', jsonb_build_object(
      'bisnis_bayar', v_bayar,
      'masa_coba_ke_bayar', v_coba_bayar,
      'rasio_masa_coba', case when v_coba > 0 then round(v_coba_bayar::numeric * 100 / v_coba, 1) end,
      'gratis_ke_bayar', (select count(distinct kos_id) from plan_activations where created_at >= v_since and months > 0
                            and coalesce(before->>'berlaku', '') = free_plan()),
      'pendapatan', (select coalesce(sum(amount), 0) from plan_requests where status = 'disetujui' and decided_at >= v_since),
      'per_paket', (select coalesce(jsonb_agg(x order by x->>'paket'), '[]'::jsonb) from (
          select jsonb_build_object('paket', plan, 'bulan', months, 'jumlah', count(*)) x, plan, months
          from plan_activations where created_at >= v_since and months > 0 group by plan, months) q)),
    'upgrade', jsonb_build_object(
      'dasar_ke_bisnis', (select count(*) from plan_activations where created_at >= v_since and before->>'paket' = 'dasar' and after->>'paket' = 'bisnis'),
      'bisnis_ke_pro', (select count(*) from plan_activations where created_at >= v_since and before->>'paket' = 'bisnis' and after->>'paket' = 'pro'),
      'pro_bulanan_ke_tahunan', (select count(*) from plan_activations where created_at >= v_since and months = 12 and before->>'paket' = 'pro' and after->>'paket' = 'pro')),
    'retensi', jsonb_build_object(
      'pelanggan_aktif', v_aktif,
      'jatuh_tempo_7_hari', (select count(*) from kos where paid_until between v_today and v_today + 7 and plan in ('dasar', 'bisnis', 'pro') and closed_at is null),
      'berakhir_periode', v_berakhir,
      'diperpanjang', v_diperpanjang,
      'tingkat_perpanjangan', case when v_berakhir > 0 then round(v_diperpanjang::numeric * 100 / v_berakhir, 1) end,
      'berhenti', v_berakhir - v_diperpanjang,
      'tingkat_churn', case when v_berakhir > 0 then round((v_berakhir - v_diperpanjang)::numeric * 100 / v_berakhir, 1) end,
      'pembatalan', v_batal,
      'tingkat_pembatalan', case when v_aktif > 0 then round(v_batal::numeric * 100 / v_aktif, 1) end,
      'tidak_aktif_14_hari', v_tidak_aktif,
      'alasan', (select coalesce(jsonb_agg(jsonb_build_object('alasan', reason, 'jumlah', c) order by c desc), '[]'::jsonb) from (
          select reason, count(*) c from cancel_reasons where created_at >= v_since group by reason) q),
      'catatan_alasan', (select coalesce(jsonb_agg(jsonb_build_object('alasan', reason, 'catatan', note, 'paket', plan, 'tanggal', created_at::date) order by created_at desc), '[]'::jsonb) from (
          select reason, note, plan, created_at from cancel_reasons where created_at >= v_since and note is not null order by created_at desc limit 20) q)),
    'pendapatan', jsonb_build_object(
      'mrr', round(v_mrr),
      'arr', round(v_mrr * 12),
      'arpa', case when v_aktif > 0 then round(v_mrr / v_aktif) end,
      'per_paket', (select coalesce(jsonb_agg(jsonb_build_object('paket', plan, 'jumlah', total) order by total desc), '[]'::jsonb) from (
          select plan, sum(amount) total from plan_requests where status = 'disetujui' and decided_at >= v_since group by plan) q),
      'promosi', (select coalesce(sum(r.amount), 0) from plan_requests r join plan_versions v on v.id = r.version_id
                   where r.status = 'disetujui' and r.decided_at >= v_since and v.list_price is not null and r.unit_price < v.list_price),
      'perpanjangan', (select coalesce(sum(amount), 0) from plan_requests where status = 'disetujui' and decided_at >= v_since and kind = 'perpanjang'),
      'catatan', 'MRR = harga paket per bulan dari bisnis yang masih aktif (Pro Tahunan dibagi 12). Perkiraan, bukan laporan keuangan. Promosi = tagihan dengan harga di bawah harga normal.'),
    'pemicu', (select coalesce(jsonb_agg(x order by (x->>'tampil')::int desc, x->>'id'), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', r.id, 'nama', r.name, 'aktif', r.active,
          'tampil', count(*) filter (where g.action = 'shown'),
          'diklik', count(*) filter (where g.action = 'clicked'),
          'ditolak', count(*) filter (where g.action = 'dismissed'),
          'checkout', count(*) filter (where g.action = 'checkout'),
          'bayar', (select count(distinct c.kos_id) from growth_log c
                      join plan_activations pa on pa.kos_id = c.kos_id and pa.months > 0
                        and pa.created_at >= c.created_at and pa.created_at <= c.created_at + interval '7 days'
                    where c.rule_id = r.id and c.action = 'checkout' and c.created_at >= v_since)) x
        from growth_rules r left join growth_log g on g.rule_id = r.id and g.created_at >= v_since
        group by r.id, r.name, r.active) q));
end $$;

-- ---------- Hak akses ----------
revoke execute on function public.plan_cancel_reason(uuid, text, text), public.site_visit(text) from public;
grant execute on function public.plan_cancel_reason(uuid, text, text) to authenticated;
grant execute on function public.site_visit(text) to anon, authenticated;
