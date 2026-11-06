-- Hapus pelanggan/supplier: dihapus permanen bila belum pernah bertransaksi; bila sudah ada riwayat, diarsipkan
-- (disembunyikan dari daftar & pilihan) agar riwayat transaksi dan laporan tetap utuh. Bisa dipulihkan.
alter table public.contacts add column if not exists archived_at timestamptz;

create or replace function public.contact_delete(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c contacts; v_bal numeric; v_used boolean;
begin
  select * into c from contacts where id = p_id for update;
  if c.id is null or not member_in(case when c.kind = 'supplier' then 'stock,finance' else 'finance' end, c.kos_id) then raise exception 'Kontak tidak ditemukan'; end if;
  v_bal := coalesce(contact_balance(c.id), 0);
  if abs(v_bal) > 0.5 then
    raise exception 'Belum bisa dihapus: masih ada sisa % %. Lunasi dulu di Kas & kasbon.', case when c.kind = 'supplier' then 'utang' else 'kasbon' end, replace(to_char(abs(v_bal), 'FM999,999,999,999'), ',', '.');
  end if;
  v_used := exists (select 1 from sales where contact_id = c.id) or exists (select 1 from purchases where contact_id = c.id)
         or exists (select 1 from debt_payments where contact_id = c.id) or exists (select 1 from sale_returns where contact_id = c.id);
  if v_used then
    update contacts set archived_at = now() where id = c.id;
    perform config_log(c.kos_id, 'arsip_kontak', c.name, jsonb_build_object('jenis', c.kind), null, 'punya riwayat transaksi', 'rendah', actor_email());
    return 'diarsipkan';
  end if;
  delete from contacts where id = c.id;
  perform config_log(c.kos_id, 'hapus_kontak', c.name, jsonb_build_object('jenis', c.kind, 'telepon', c.phone), null, null, 'rendah', actor_email());
  return 'dihapus';
end $$;

create or replace function public.contact_restore(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c contacts;
begin
  select * into c from contacts where id = p_id;
  if c.id is null or not member_in(case when c.kind = 'supplier' then 'stock,finance' else 'finance' end, c.kos_id) then raise exception 'Kontak tidak ditemukan'; end if;
  update contacts set archived_at = null where id = p_id;
  perform config_log(c.kos_id, 'pulihkan_kontak', c.name, null, null, null, 'rendah', actor_email());
end $$;

-- Daftar kontak menyertakan status arsip; kasir hanya menampilkan pelanggan aktif
do $$
declare v text;
begin
  v := pg_get_functiondef('public.contacts_overview(uuid)'::regprocedure);
  if position('select c.id, c.kind, c.name, c.phone, c.created_at,' in v) = 0 then raise exception 'contacts_overview berubah'; end if;
  execute replace(v, 'select c.id, c.kind, c.name, c.phone, c.created_at,', 'select c.id, c.kind, c.name, c.phone, c.created_at, c.archived_at,');
  v := pg_get_functiondef('public.kasir_catalog(uuid)'::regprocedure);
  if position('where c.kos_id = p_kos and c.kind = ''pelanggan''' in v) = 0 then raise exception 'kasir_catalog berubah'; end if;
  execute replace(v, 'where c.kos_id = p_kos and c.kind = ''pelanggan''', 'where c.kos_id = p_kos and c.kind = ''pelanggan'' and c.archived_at is null');
end $$;

revoke execute on function public.contact_delete(uuid), public.contact_restore(uuid) from public, anon;
grant execute on function public.contact_delete(uuid), public.contact_restore(uuid) to authenticated;
