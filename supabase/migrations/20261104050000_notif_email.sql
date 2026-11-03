-- Pemilik kos bisa memilih menerima email saat penghuni mengirim bukti transfer
alter table public.kos add column if not exists notify_email boolean not null default true;
grant update (name, address, contact_phone, payment_info, house_rules, notify_email) on public.kos to authenticated;
