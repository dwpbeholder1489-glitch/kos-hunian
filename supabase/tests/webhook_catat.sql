\set ON_ERROR_STOP 1
do $$
declare r text; i int := 0; ev pay_events; n0 int; n1 int; n2 int; pl0 text; pl1 text;
begin
  select count(*) into n0 from plan_activations;
  select count(*) into n1 from pay_transactions;
  select count(*) into n2 from plan_requests;
  select string_agg(plan||'|'||coalesce(paid_until::text,'-')||'|'||coalesce(trial_until::text,'-'), ';' order by id) into pl0 from kos;

  r := pay_event_catat('lynk', 'uji-isi-001', '{"raw":"x"}', '{"x-lynk-signature":"abc"}');
  assert r = 'dicatat', 'pertama harus dicatat, dapat ' || r;
  r := pay_event_catat('lynk', 'uji-isi-001', '{"raw":"x"}', '{}');
  assert r = 'duplikat', 'kedua harus duplikat, dapat ' || r;
  select * into ev from pay_events where provider = 'lynk' and event_key = 'uji-isi-001';
  assert ev.status = 'diabaikan' and ev.signature_ok is null and ev.seen = 2, 'status/seen salah: ' || ev.status || '/' || ev.seen;
  assert ev.headers->>'x-lynk-signature' = 'abc', 'header tidak tersimpan';
  assert ev.transaction_id is null and ev.processed_at is null, 'kolom proses terisi';

  assert (select count(*) from plan_activations) = n0, 'riwayat aktivasi tersentuh';
  assert (select count(*) from pay_transactions) = n1, 'transaksi tersentuh';
  assert (select count(*) from plan_requests) = n2, 'tagihan tersentuh';
  select string_agg(plan||'|'||coalesce(paid_until::text,'-')||'|'||coalesce(trial_until::text,'-'), ';' order by id) into pl1 from kos;
  assert pl0 is not distinct from pl1, 'paket bisnis berubah';

  begin perform pay_event_catat('manual', 'uji-manual-1', null, null); assert false, 'manual seharusnya ditolak';
  exception when others then assert sqlerrm like '%tidak dikenal%', 'pesan manual salah: ' || sqlerrm; end;
  begin perform pay_event_catat('xxx', 'uji-xxx-1', null, null); assert false, 'xxx seharusnya ditolak';
  exception when others then assert sqlerrm like '%tidak dikenal%', 'pesan xxx salah: ' || sqlerrm; end;
  begin perform pay_event_catat('lynk', 'abc', null, null); assert false, 'kunci pendek seharusnya ditolak';
  exception when others then assert sqlerrm like '%tidak valid%', 'pesan kunci salah: ' || sqlerrm; end;

  loop
    i := i + 1;
    r := pay_event_catat('lynk', 'batas-' || i, null, null);
    exit when r = 'batas';
    assert i < 1000, 'batas harian tidak berfungsi';
  end loop;
  assert i between 480 and 500, 'batas tidak 500: ' || i;
  raise notice 'batas harian aktif setelah % catatan', i;
end $$;

-- Tanpa hak service role, pemanggilan langsung harus ditolak
set role anon;
do $$ begin begin perform pay_event_catat('lynk', 'uji-anon-1', null, null); assert false, 'anon lolos';
exception when insufficient_privilege then null; end; end $$;
reset role;
set role authenticated;
do $$ begin begin perform pay_event_catat('lynk', 'uji-auth-1', null, null); assert false, 'authenticated lolos';
exception when insufficient_privilege then null; end; end $$;
reset role;

select 'status' k, status, count(*) from pay_events where provider = 'lynk' group by status order by status;
select 'tidak_tersentuh' k, (select count(*) from plan_activations) aktivasi, (select count(*) from pay_transactions) trx;
