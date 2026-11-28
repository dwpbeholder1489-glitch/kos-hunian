begin;
insert into auth.users(id, email) values
 ('a1000000-0000-4000-8000-000000000001', 'learning-owner@example.test'),
 ('a1000000-0000-4000-8000-000000000002', 'learning-staff@example.test');
insert into public.kos(id, name, owner_id, business_type) values
 ('a1000000-0000-4000-8000-000000000011', 'Tes Pembelajaran', 'a1000000-0000-4000-8000-000000000001', 'retail'),
 ('a1000000-0000-4000-8000-000000000012', 'Bisnis Lain', 'a1000000-0000-4000-8000-000000000001', 'retail');
insert into public.kos_members(kos_id, user_id, role, active) values
 ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'pemilik', true),
 ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000002', 'kasir', true),
 ('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'pemilik', true)
on conflict (kos_id, user_id) do update set role = excluded.role, active = true;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$
declare
  k uuid := 'a1000000-0000-4000-8000-000000000011';
  saved public.learning_progress;
  first_attempt jsonb := '[{"at":"2026-11-27T01:00:00.000Z","score":6,"max":7}]';
begin
  saved := public.learning_progress_save(k, 'retail', 2::smallint, '{0,2,3}', 4::smallint,
    now() - interval '1 hour', now(), 1, first_attempt);
  saved := public.learning_progress_save(k, 'retail', 2::smallint, '{1,4,5,6,7}', 7::smallint,
    now() - interval '2 hours', now() - interval '30 minutes', 0, first_attempt);
  if saved.done <> '{0,1,2,3,4,5,6,7}'::smallint[] or saved.current_step <> 4 or saved.practice_count <> 1
    or saved.completed_at is null or jsonb_array_length(saved.attempts) <> 1 then
    raise exception 'Gabungan progres dua perangkat tidak sesuai: %', saved;
  end if;
  begin
    perform public.learning_progress_save(k, 'retail', 2::smallint, '{8}', 4::smallint, now(), now(), 1, '[]');
    raise exception 'Tahap tidak valid diterima';
  exception when invalid_parameter_value then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
do $$
declare
  own_kos uuid := 'a1000000-0000-4000-8000-000000000011';
  foreign_kos uuid := 'a1000000-0000-4000-8000-000000000012';
  saved public.learning_progress;
begin
  if exists (select 1 from public.learning_progress) then raise exception 'Staf melihat progres pemilik'; end if;
  begin
    perform public.learning_progress_save(foreign_kos, 'retail', 2::smallint, '{0}', 1::smallint, now(), now(), 0, '[]');
    raise exception 'Tulis lintas bisnis diterima';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.learning_progress set current_step = 7;
    raise exception 'Pembaruan langsung diterima';
  exception when insufficient_privilege then null;
  end;
  saved := public.learning_progress_save(own_kos, 'retail', 2::smallint, '{0}', 1::smallint, now(), now(), 0, '[]');
  if saved.role <> 'kasir' or (select count(*) from public.learning_progress) <> 1 then
    raise exception 'Penyimpanan staf tidak terisolasi';
  end if;
end $$;
rollback;
