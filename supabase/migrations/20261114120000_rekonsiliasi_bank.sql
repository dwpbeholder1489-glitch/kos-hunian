-- Rekonsiliasi bank (Master Prompt V2 §4.1 "Rekonsiliasi": Dasar -, Bisnis ✓, Pro ✓).
-- Cara kerja (standar akuntansi, disederhanakan untuk UMKM):
--   1) Per bulan, pemilik/keuangan mengisi SALDO REKENING KORAN di akhir bulan.
--   2) Menandai baris jurnal akun Bank (1-1200, sys_key 'bank') yang SUDAH tercantum di rekening koran.
--      Baris yang sudah ditandai di bulan sebelumnya tidak muncul lagi (sudah cocok).
--   3) Saldo seharusnya di bank = jumlah semua baris Bank yang sudah ditandai sampai akhir bulan.
--      Selisih = saldo rekening koran − saldo seharusnya. Selesai HANYA bila selisih 0
--      (biaya admin/bunga bank yang belum dicatat → catat dulu di Kas/Pengeluaran atau jurnal manual).
--   Saldo buku (semua baris Bank) dan "belum muncul di bank" ditampilkan untuk penjelasan.
-- Fitur baru (tidak ada sebelumnya) → tanpa pengecualian bisnis lama: mulai Paket Bisnis.

update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{rekonsiliasi}'::text[]) f)
where v.plan_key in ('bisnis', 'pro') and v.id = (public.plan_current(v.plan_key)).id;

create table if not exists public.bank_recons (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  statement_balance numeric(16,2),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'draf' check (status in ('draf', 'selesai')),
  created_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  finished_by text,
  unique (kos_id, month)
);
create table if not exists public.bank_recon_marks (
  line_id bigint primary key references public.acct_lines(id) on delete cascade,   -- satu baris jurnal hanya cocok sekali
  recon_id uuid not null references public.bank_recons(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  marked_by text,
  marked_at timestamptz not null default now()
);
create index if not exists bank_recon_marks_recon on public.bank_recon_marks(recon_id);
alter table public.bank_recons enable row level security;
alter table public.bank_recon_marks enable row level security;
drop policy if exists bank_recons_select on public.bank_recons;
create policy bank_recons_select on public.bank_recons for select using (public.member_can(kos_id, 'finance'));
grant select on public.bank_recons to authenticated;      -- penanda baris hanya lewat fungsi (tanpa policy)
drop trigger if exists zz_kos_open_guard on public.bank_recons;
create trigger zz_kos_open_guard before insert or update or delete on public.bank_recons for each row execute function public.kos_open_guard();
drop trigger if exists zz_kos_open_guard on public.bank_recon_marks;
create trigger zz_kos_open_guard before insert or update or delete on public.bank_recon_marks for each row execute function public.kos_open_guard();

-- Akun Bank bisnis ini
create or replace function public.bank_account_id(p_kos uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from acct_accounts where kos_id = p_kos and sys_key = 'bank';
$$;

create or replace function public._bank_recon_check(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'rekonsiliasi') then raise exception 'BATAS_PAKET: Rekonsiliasi bank tersedia mulai Paket Bisnis.'; end if;
end $$;

-- Ringkasan & daftar baris satu bulan
create or replace function public.bank_recon_get(p_kos uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_end date; r bank_recons; v_acc uuid;
        v_buku numeric; v_cocok numeric; v_aktif boolean;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  v_aktif := plan_has(p_kos, 'rekonsiliasi');
  v_end := (v_m + interval '1 month - 1 day')::date;
  if not v_aktif then
    return jsonb_build_object('aktif', false, 'bulan', v_m);
  end if;
  perform acct_sync_internal(p_kos);   -- pastikan transaksi terbaru sudah jadi jurnal
  v_acc := bank_account_id(p_kos);
  select * into r from bank_recons where kos_id = p_kos and month = v_m;
  select coalesce(sum(l.debit - l.credit), 0) into v_buku
    from acct_lines l join acct_entries e on e.id = l.entry_id where l.account_id = v_acc and e.entry_date <= v_end;
  select coalesce(sum(l.debit - l.credit), 0) into v_cocok
    from acct_lines l join acct_entries e on e.id = l.entry_id join bank_recon_marks m on m.line_id = l.id
    join bank_recons br on br.id = m.recon_id
    where l.account_id = v_acc and e.entry_date <= v_end and br.month <= v_m;
  return jsonb_build_object(
    'aktif', true, 'bulan', v_m, 'akhir', v_end, 'ada_akun', v_acc is not null,
    'rekon', case when r.id is null then null else jsonb_build_object('id', r.id, 'saldo_koran', r.statement_balance, 'catatan', r.note,
      'status', r.status, 'selesai_pada', r.finished_at, 'selesai_oleh', r.finished_by) end,
    'saldo_buku', v_buku,
    'saldo_cocok', v_cocok,
    'selisih', case when r.statement_balance is null then null else round(r.statement_balance - v_cocok, 2) end,
    'belum_muncul', round(v_buku - v_cocok, 2),
    'baris', (select coalesce(jsonb_agg(x order by x->>'tanggal', (x->>'id')::bigint), '[]'::jsonb) from (
      select jsonb_build_object('id', l.id, 'tanggal', e.entry_date, 'nomor', e.number, 'uraian', coalesce(nullif(l.memo, ''), e.description),
        'masuk', l.debit, 'keluar', l.credit, 'cocok', m.line_id is not null, 'cocok_bulan', br.month) x
      from acct_lines l join acct_entries e on e.id = l.entry_id
      left join bank_recon_marks m on m.line_id = l.id left join bank_recons br on br.id = m.recon_id
      where l.account_id = v_acc and e.entry_date <= v_end
        and (m.line_id is null or br.month = v_m)            -- yang sudah cocok di bulan sebelumnya tidak ditampilkan lagi
      order by e.entry_date, l.id limit 500) q),
    'riwayat', (select coalesce(jsonb_agg(jsonb_build_object('bulan', month, 'status', status) order by month desc), '[]'::jsonb)
                from (select month, status from bank_recons where kos_id = p_kos order by month desc limit 12) h));
end $$;

-- Simpan saldo rekening koran (membuat draf bila belum ada)
create or replace function public.bank_recon_save(p_kos uuid, p_month date, p_statement numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; r bank_recons;
begin
  perform _bank_recon_check(p_kos);
  if v_m > date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date then raise exception 'Bulan belum berjalan'; end if;
  if p_statement is not null and abs(p_statement) > 99999999999999 then raise exception 'Saldo tidak valid'; end if;
  select * into r from bank_recons where kos_id = p_kos and month = v_m;
  if r.status = 'selesai' then raise exception 'Rekonsiliasi bulan ini sudah selesai. Buka kembali dulu bila perlu diubah.'; end if;
  insert into bank_recons(kos_id, month, statement_balance, note, created_by)
  values (p_kos, v_m, round(p_statement, 2), nullif(trim(coalesce(p_note, '')), ''), actor_email())
  on conflict (kos_id, month) do update set statement_balance = excluded.statement_balance, note = excluded.note
  returning * into r;
  return r.id;
end $$;

-- Tandai / batalkan tanda baris jurnal Bank sebagai sudah muncul di rekening koran
create or replace function public.bank_recon_mark(p_kos uuid, p_month date, p_lines bigint[], p_cocok boolean)
returns int language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_end date; r bank_recons; v_acc uuid; v_n int;
begin
  perform _bank_recon_check(p_kos);
  if coalesce(array_length(p_lines, 1), 0) = 0 then return 0; end if;
  if array_length(p_lines, 1) > 500 then raise exception 'Paling banyak 500 baris sekali tandai'; end if;
  v_end := (v_m + interval '1 month - 1 day')::date;
  select * into r from bank_recons where kos_id = p_kos and month = v_m;
  if r.id is null then
    insert into bank_recons(kos_id, month, created_by) values (p_kos, v_m, actor_email()) returning * into r;
  end if;
  if r.status = 'selesai' then raise exception 'Rekonsiliasi bulan ini sudah selesai. Buka kembali dulu bila perlu diubah.'; end if;
  v_acc := bank_account_id(p_kos);
  if p_cocok then
    insert into bank_recon_marks(line_id, recon_id, kos_id, marked_by)
    select l.id, r.id, p_kos, actor_email()
    from acct_lines l join acct_entries e on e.id = l.entry_id
    where l.id = any(p_lines) and l.kos_id = p_kos and l.account_id = v_acc and e.entry_date <= v_end
    on conflict (line_id) do nothing;
  else
    delete from bank_recon_marks where recon_id = r.id and line_id = any(p_lines);
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Selesaikan: hanya bila saldo koran sudah diisi dan selisih 0
create or replace function public.bank_recon_finish(p_kos uuid, p_month date)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; d jsonb; r bank_recons;
begin
  perform _bank_recon_check(p_kos);
  select * into r from bank_recons where kos_id = p_kos and month = v_m;
  if r.id is null or r.statement_balance is null then raise exception 'Isi dulu saldo rekening koran akhir bulan'; end if;
  if r.status = 'selesai' then return; end if;
  if exists (select 1 from bank_recons where kos_id = p_kos and month < v_m and status = 'draf') then
    raise exception 'Selesaikan dulu rekonsiliasi bulan sebelumnya yang masih draf';
  end if;
  d := bank_recon_get(p_kos, v_m);
  if (d->>'selisih')::numeric <> 0 then
    raise exception 'Masih ada selisih %. Tandai baris yang sudah muncul di rekening, atau catat biaya admin/bunga bank yang belum dicatat.', d->>'selisih';
  end if;
  update bank_recons set status = 'selesai', finished_at = now(), finished_by = actor_email() where id = r.id;
  perform config_log(p_kos, 'selesai_rekonsiliasi_bank', to_char(v_m, 'YYYY-MM'), null,
    jsonb_build_object('saldo_koran', r.statement_balance, 'saldo_buku', d->'saldo_buku', 'belum_muncul', d->'belum_muncul'), r.note, 'rendah', null);
end $$;

-- Buka kembali (pemilik; hanya bulan selesai terakhir, wajib alasan)
create or replace function public.bank_recon_reopen(p_kos uuid, p_month date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; r bank_recons;
begin
  if not member_in('team', p_kos) then raise exception 'Hanya pemilik yang bisa membuka kembali rekonsiliasi'; end if;
  perform _bank_recon_check(p_kos);
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tulis alasan membuka kembali (minimal 5 huruf)'; end if;
  select * into r from bank_recons where kos_id = p_kos and month = v_m;
  if r.status is distinct from 'selesai' then raise exception 'Rekonsiliasi bulan ini belum selesai'; end if;
  if exists (select 1 from bank_recons where kos_id = p_kos and month > v_m and status = 'selesai') then
    raise exception 'Buka kembali dulu bulan yang lebih baru';
  end if;
  update bank_recons set status = 'draf', finished_at = null, finished_by = null where id = r.id;
  perform config_log(p_kos, 'buka_rekonsiliasi_bank', to_char(v_m, 'YYYY-MM'), jsonb_build_object('status', 'selesai'), jsonb_build_object('status', 'draf'), p_reason, 'menengah', null);
end $$;

-- Growth: penawaran saat fitur rekonsiliasi dibuka tanpa paket
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'FINANCE.RECONCILIATION_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED'));
create or replace function public.growth_event_feature(p_event text)
returns text language sql immutable as $$
  select case p_event when 'FINANCE.MANUAL_JOURNAL_REQUESTED' then 'jurnal_manual' when 'FINANCE.RECONCILIATION_REQUESTED' then 'rekonsiliasi'
    when 'BUDGET.CREATE_REQUESTED' then 'anggaran' when 'TRANSACTION.APPROVAL_REQUESTED' then 'persetujuan' when 'WORKFLOW.REQUESTED' then 'otomatisasi' end;
$$;
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.FINANCE.RECONCILIATION.' || upper(p.k), 'Rekonsiliasi bank (' || p.n || ')', 'fitur', 'upgrade', p.k, 'bisnis', 1, 'FINANCE.RECONCILIATION_REQUESTED',
  'Pastikan saldo bank Anda cocok.',
  'Paket Bisnis menyediakan rekonsiliasi bank: cocokkan catatan bank di PRASARA dengan rekening koran setiap bulan dan temukan selisihnya.',
  'Upgrade ke Paket Bisnis', 'Nanti saja', 30, 7, false, 'sistem'
from (values ('dasar', 'Dasar'), ('gratis', 'Gratis')) as p(k, n)
on conflict (id) do nothing;

revoke execute on function public.bank_account_id(uuid), public._bank_recon_check(uuid) from public, anon, authenticated;
revoke execute on function public.bank_recon_get(uuid, date), public.bank_recon_save(uuid, date, numeric, text), public.bank_recon_mark(uuid, date, bigint[], boolean),
  public.bank_recon_finish(uuid, date), public.bank_recon_reopen(uuid, date, text) from public, anon;
grant execute on function public.bank_recon_get(uuid, date), public.bank_recon_save(uuid, date, numeric, text), public.bank_recon_mark(uuid, date, bigint[], boolean),
  public.bank_recon_finish(uuid, date), public.bank_recon_reopen(uuid, date, text) to authenticated;
