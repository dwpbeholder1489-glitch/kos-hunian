-- Ekspor data yang mudah dibaca (Excel & PDF): lembar-lembar bernama Indonesia, kolom berjudul jelas,
-- tanpa kode internal (id/uuid/token) — nama barang, pelanggan, lokasi, dan pencatat ditampilkan sebagai nama.

create or replace function public.xs(p_name text, p_cols text[], p_types text[], p_rows jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object('name', p_name, 'cols', to_jsonb(p_cols), 'types', to_jsonb(p_types), 'rows', coalesce(p_rows, '[]'::jsonb));
$$;
create or replace function public.xs_time(p timestamptz)
returns text language sql immutable as $$ select to_char(p at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'); $$;
create or replace function public.xs_user(p uuid)
returns text language sql stable security definer set search_path = public as $$ select email from auth.users where id = p; $$;

create or replace function public.business_export_sheets(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k kos; s jsonb := '[]';
begin
  if not member_can(p_kos, 'team') then raise exception 'Unduh seluruh data hanya oleh pemilik'; end if;
  select * into k from kos where id = p_kos;

  if k.business_type = 'retail' then
    s := s || xs('Barang', array['Nama barang', 'Kode', 'Satuan dasar', 'Stok', 'Harga modal', 'Stok minimum', 'Aktif'], array['t', 't', 't', 'n', 'r', 'n', 't'],
      (select jsonb_agg(jsonb_build_array(name, sku, base_unit, stock, cost, min_stock, case when active then 'ya' else 'tidak' end) order by name) from products where kos_id = p_kos));
    s := s || xs('Satuan & harga', array['Barang', 'Satuan', 'Isi (satuan dasar)', 'Harga eceran', 'Harga grosir', 'Barcode'], array['t', 't', 'n', 'r', 'r', 't'],
      (select jsonb_agg(jsonb_build_array(p.name, u.name, u.qty, u.price_retail, u.price_wholesale, u.barcode) order by p.name, u.sort) from product_units u join products p on p.id = u.product_id where u.kos_id = p_kos));
    if exists (select 1 from branches where kos_id = p_kos and not is_main) then
      s := s || xs('Stok per lokasi', array['Barang', 'Lokasi', 'Stok'], array['t', 't', 'n'],
        (select jsonb_agg(jsonb_build_array(p.name, b.name, l.qty) order by p.name, b.name) from stock_levels l join products p on p.id = l.product_id join branches b on b.id = l.branch_id where l.kos_id = p_kos and l.qty <> 0));
    end if;
    s := s || xs('Penjualan', array['Tanggal', 'Waktu', 'Nomor', 'Harga', 'Subtotal', 'Diskon', 'Total', 'Modal (HPP)', 'Cara bayar', 'Pelanggan', 'Jatuh tempo', 'Status', 'Alasan batal', 'Lokasi', 'Kasir'],
      array['d', 't', 't', 't', 'r', 'r', 'r', 'r', 't', 't', 'd', 't', 't', 't', 't'],
      (select jsonb_agg(jsonb_build_array(x.sale_date, xs_time(x.sold_at), x.number, x.tier, x.subtotal, x.discount, x.total, x.cost_total, x.pay_method, c.name, x.due_date, x.status, x.void_reason, b.name, xs_user(x.created_by)) order by x.sold_at)
       from sales x left join contacts c on c.id = x.contact_id left join branches b on b.id = x.branch_id where x.kos_id = p_kos));
    s := s || xs('Rincian penjualan', array['Tanggal', 'Nomor', 'Barang', 'Jumlah', 'Satuan', 'Harga', 'Subtotal', 'Modal per satuan dasar', 'Status'], array['d', 't', 't', 'n', 't', 'r', 'r', 'r', 't'],
      (select jsonb_agg(jsonb_build_array(x.sale_date, x.number, l.name, l.qty, l.unit, l.price, l.line_total, l.cost, x.status) order by x.sold_at, l.name) from sale_lines l join sales x on x.id = l.sale_id where l.kos_id = p_kos));
    s := s || xs('Retur penjualan', array['Tanggal', 'Nomor retur', 'Dari penjualan', 'Barang', 'Jumlah', 'Satuan', 'Nilai', 'Pengembalian', 'Alasan'], array['d', 't', 't', 't', 'n', 't', 'r', 't', 't'],
      (select jsonb_agg(jsonb_build_array(r.return_date, r.number, x.number, l.name, l.qty, l.unit, l.amount, r.refund_method, r.reason) order by r.created_at) from sale_return_lines l join sale_returns r on r.id = l.return_id join sales x on x.id = r.sale_id where l.kos_id = p_kos));
    s := s || xs('Belanja', array['Tanggal', 'Nomor', 'Supplier', 'Total diterima', 'Total pesanan', 'Cara bayar', 'Jatuh tempo', 'Status', 'Alasan batal', 'Lokasi', 'Catatan', 'Dicatat oleh'],
      array['d', 't', 't', 'r', 'r', 't', 'd', 't', 't', 't', 't', 't'],
      (select jsonb_agg(jsonb_build_array(x.purchase_date, x.number, c.name, x.total, x.order_total, x.pay_method, x.due_date, x.status, x.void_reason, b.name, x.note, xs_user(x.created_by)) order by x.created_at)
       from purchases x left join contacts c on c.id = x.contact_id left join branches b on b.id = x.branch_id where x.kos_id = p_kos));
    s := s || xs('Rincian belanja', array['Tanggal', 'Nomor', 'Barang', 'Dipesan', 'Diterima', 'Satuan', 'Harga beli', 'Subtotal'], array['d', 't', 't', 'n', 'n', 't', 'r', 'r'],
      (select jsonb_agg(jsonb_build_array(x.purchase_date, x.number, l.name, l.qty, l.qty_received, l.unit, l.price, l.line_total) order by x.created_at, l.name) from purchase_lines l join purchases x on x.id = l.purchase_id where l.kos_id = p_kos));
    s := s || xs('Retur ke supplier', array['Tanggal', 'Nomor retur', 'Dari belanja', 'Supplier', 'Barang', 'Jumlah', 'Satuan', 'Nilai', 'Pengembalian', 'Alasan'], array['d', 't', 't', 't', 't', 'n', 't', 'r', 't', 't'],
      (select jsonb_agg(jsonb_build_array(r.return_date, r.number, x.number, c.name, l.name, l.qty, l.unit, l.amount, r.refund_method, r.reason) order by r.created_at)
       from purchase_return_lines l join purchase_returns r on r.id = l.return_id join purchases x on x.id = r.purchase_id left join contacts c on c.id = r.contact_id where l.kos_id = p_kos));
    s := s || xs('Pelanggan & supplier', array['Nama', 'Jenis', 'No. HP', 'Sisa kasbon/utang', 'Diarsipkan'], array['t', 't', 't', 'r', 't'],
      (select jsonb_agg(jsonb_build_array(name, kind, phone, contact_balance(id), case when archived_at is null then '' else 'ya' end) order by kind, name) from contacts where kos_id = p_kos));
    s := s || xs('Bayar kasbon & utang', array['Tanggal', 'Jenis', 'Kontak', 'Jumlah', 'Masuk/keluar lewat', 'Status', 'Catatan'], array['d', 't', 't', 'r', 't', 't', 't'],
      (select jsonb_agg(jsonb_build_array(d.date, case when d.kind = 'piutang' then 'terima kasbon' else 'bayar utang' end, c.name, d.amount, d.account, d.status, coalesce(d.note, d.void_reason)) order by d.created_at)
       from debt_payments d left join contacts c on c.id = d.contact_id where d.kos_id = p_kos));
    s := s || xs('Riwayat stok', array['Waktu', 'Barang', 'Jenis', 'Perubahan', 'Stok total sesudah', 'Nilai modal', 'Lokasi', 'Catatan'], array['t', 't', 't', 'n', 'n', 'r', 't', 't'],
      (select jsonb_agg(jsonb_build_array(xs_time(m.created_at), p.name, m.kind, m.delta, m.stock_after, m.value, b.name, m.note) order by m.created_at) from stock_moves m join products p on p.id = m.product_id left join branches b on b.id = m.branch_id where m.kos_id = p_kos));
    s := s || xs('Mutasi lokasi', array['Waktu', 'Nomor', 'Dari', 'Ke', 'Barang', 'Catatan', 'Oleh'], array['t', 't', 't', 't', 't', 't', 't'],
      (select jsonb_agg(jsonb_build_array(xs_time(t.created_at), t.number, f.name, g.name, (select string_agg((x->>'name') || ' ' || (x->>'qty') || ' ' || (x->>'unit'), ', ') from jsonb_array_elements(t.lines) x), t.note, t.created_email) order by t.created_at)
       from stock_transfers t join branches f on f.id = t.from_branch join branches g on g.id = t.to_branch where t.kos_id = p_kos));
    s := s || xs('Shift kasir', array['Buka', 'Tutup', 'Kasir', 'Modal awal', 'Seharusnya', 'Dihitung', 'Selisih', 'Catatan'], array['t', 't', 't', 'r', 'r', 'r', 'r', 't'],
      (select jsonb_agg(jsonb_build_array(xs_time(opened_at), xs_time(closed_at), xs_user(user_id), opening_cash, expected_cash, counted_cash, counted_cash - expected_cash, note) order by opened_at) from cash_shifts where kos_id = p_kos));
  else
    s := s || xs('Kamar', array['Kode', 'Nama', 'Sewa', 'Status', 'Fasilitas', 'Catatan'], array['t', 't', 'r', 't', 't', 't'],
      (select jsonb_agg(jsonb_build_array(code, name, rent, status, (select string_agg(f, ', ') from jsonb_array_elements_text(to_jsonb(facilities)) f), notes) order by code) from rooms where kos_id = p_kos));
    s := s || xs('Penghuni', array['Nama', 'No. HP', 'Email', 'Kontak darurat', 'Catatan', 'Terdaftar'], array['t', 't', 't', 't', 't', 'd'],
      (select jsonb_agg(jsonb_build_array(name, phone, email, emergency, notes, created_at::date) order by name) from occupants where kos_id = p_kos));
    s := s || xs('Sewa', array['Penghuni', 'Kamar', 'Mulai', 'Selesai', 'Sewa per bulan', 'Status', 'Alasan selesai'], array['t', 't', 'd', 'd', 'r', 't', 't'],
      (select jsonb_agg(jsonb_build_array(o.name, r.code, l.start_date, l.end_date, l.rent, l.status, l.end_reason) order by l.start_date) from leases l join occupants o on o.id = l.occupant_id join rooms r on r.id = l.room_id where l.kos_id = p_kos));
    s := s || xs('Tagihan', array['Penghuni', 'Kamar', 'Jenis', 'Periode mulai', 'Periode akhir', 'Jatuh tempo', 'Jumlah', 'Sudah dibayar', 'Sisa', 'Status', 'Keterangan'], array['t', 't', 't', 'd', 'd', 'd', 'r', 'r', 'r', 't', 't'],
      (select jsonb_agg(jsonb_build_array(o.name, r.code, i.kind, i.period_start, i.period_end, i.due_date, i.amount, i.amount - v.outstanding, v.outstanding, i.status, coalesce(i.description, i.cancel_reason)) order by i.due_date)
       from invoices i left join occupants o on o.id = i.occupant_id left join rooms r on r.id = i.room_id left join invoice_summary v on v.id = i.id where i.kos_id = p_kos));
    s := s || xs('Pembayaran', array['Tanggal bayar', 'Penghuni', 'Jumlah', 'Cara bayar', 'Referensi', 'Status', 'Diverifikasi', 'Catatan'], array['d', 't', 'r', 't', 't', 't', 't', 't'],
      (select jsonb_agg(jsonb_build_array(p.paid_at, o.name, p.amount, p.method, p.ref, p.status, xs_time(p.verified_at), p.notes) order by p.paid_at)
       from payments p left join invoices i on i.id = p.invoice_id left join occupants o on o.id = i.occupant_id where p.kos_id = p_kos));
  end if;

  s := s || xs('Pengeluaran', array['Tanggal', 'Kategori', 'Jenis', 'Jumlah', 'Dari', 'Keterangan'], array['d', 't', 't', 'r', 't', 't'],
    (select jsonb_agg(jsonb_build_array(e.date, c.name, e.kind, e.amount, e.account, e.description) order by e.date) from expenses e left join expense_categories c on c.id = e.category_id where e.kos_id = p_kos));
  s := s || xs('Kas lainnya', array['Tanggal', 'Jenis', 'Jumlah', 'Akun', 'Keterangan'], array['d', 't', 'r', 't', 't'],
    (select jsonb_agg(jsonb_build_array(date, replace(kind, '_', ' '), amount, account, description) order by date) from cash_entries where kos_id = p_kos));
  if exists (select 1 from acct_entries where kos_id = p_kos) then
    s := s || xs('Jurnal', array['Tanggal', 'Nomor', 'Keterangan', 'Kode akun', 'Akun', 'Debit', 'Kredit'], array['d', 't', 't', 't', 't', 'r', 'r'],
      (select jsonb_agg(jsonb_build_array(e.entry_date, e.number, e.description, a.code, a.name, l.debit, l.credit) order by e.entry_date, e.number, l.id)
       from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id where l.kos_id = p_kos));
  end if;
  s := s || xs('Persetujuan', array['Waktu', 'Nomor', 'Permintaan', 'Diminta oleh', 'Status', 'Diputuskan oleh', 'Catatan'], array['t', 't', 't', 't', 't', 't', 't'],
    (select jsonb_agg(jsonb_build_array(xs_time(created_at), number, summary, coalesce(requested_email, requested_via), status, decided_by, decision_note) order by created_at) from approvals where kos_id = p_kos));
  s := s || xs('Riwayat perubahan', array['Waktu', 'Tindakan', 'Objek', 'Oleh', 'Alasan', 'Risiko'], array['t', 't', 't', 't', 't', 't'],
    (select jsonb_agg(jsonb_build_array(xs_time(created_at), replace(action, '_', ' '), coalesce((select m.name from modules m where m.code = config_history.target), target), actor, reason, risk) order by created_at) from config_history where kos_id = p_kos));

  update kos set last_export_at = now() where id = p_kos;
  perform config_log(p_kos, 'ekspor_data', 'Excel/PDF', null, jsonb_build_object('lembar', jsonb_array_length(s)), null, 'menengah', actor_email());
  return jsonb_build_object('business', k.name, 'type', k.business_type, 'address', k.address, 'exported_at', xs_time(now()), 'sheets', s);
end $$;

revoke execute on function public.xs(text, text[], text[], jsonb), public.xs_time(timestamptz), public.xs_user(uuid) from public, anon, authenticated;
revoke execute on function public.business_export_sheets(uuid) from public, anon;
grant execute on function public.business_export_sheets(uuid) to authenticated;
-- format lama (tabel mentah) tidak dipakai lagi oleh aplikasi
revoke execute on function public.business_export(uuid) from authenticated;
