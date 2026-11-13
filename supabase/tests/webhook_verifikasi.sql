\set ON_ERROR_STOP 1
do $$
declare r text; ev pay_events; n0 int; n1 int;
begin
  select count(*) into n0 from plan_activations;
  select count(*) into n1 from pay_transactions;

  r := pay_event_catat('lynk', 'verif-ok-0001', '{}', '{}', true, '{"paid":true,"amount":72000,"ref":"R1"}');
  assert r = 'dicatat', 'ok: ' || r;
  select * into ev from pay_events where provider = 'lynk' and event_key = 'verif-ok-0001';
  assert ev.status = 'diterima' and ev.signature_ok is true, 'status ok salah: ' || ev.status;
  assert ev.norm->>'ref' = 'R1', 'norm tidak tersimpan';
  assert not exists (select 1 from pay_recon where event_id = ev.id), 'tanda tangan cocok tidak boleh masuk rekonsiliasi';

  r := pay_event_catat('lynk', 'verif-bad-0001', '{}', '{}', false, '{"paid":true,"amount":72000}');
  select * into ev from pay_events where provider = 'lynk' and event_key = 'verif-bad-0001';
  assert ev.status = 'ditolak' and ev.signature_ok is false, 'status bad salah';
  assert exists (select 1 from pay_recon where event_id = ev.id and reason = 'tanda_tangan' and status = 'terbuka'), 'antrean rekonsiliasi tidak dibuat';

  r := pay_event_catat('lynk', 'verif-bad-0001', '{}', '{}', false, '{"paid":true,"amount":72000}');
  assert r = 'duplikat', 'duplikat tidak terdeteksi: ' || r;
  assert (select count(*) from pay_recon where event_id = ev.id) = 1, 'antrean ganda';

  r := pay_event_catat('lynk', 'verif-null-0001', '{}', '{}');
  select * into ev from pay_events where provider = 'lynk' and event_key = 'verif-null-0001';
  assert ev.status = 'diabaikan' and ev.signature_ok is null, 'null salah';

  assert (select count(*) from plan_activations) = n0, 'aktivasi tersentuh';
  assert (select count(*) from pay_transactions) = n1, 'transaksi tersentuh';
  raise notice 'uji verifikasi SQL lolos';
end $$;
