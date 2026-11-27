-- Perbaikan migrasi 20261128100000: jadwal pg_cron 'prasara-notif' tidak terbuat di Supabase karena
-- cron.schedule punya beberapa versi (overload) sehingga to_regproc('cron.schedule') = null dan langkahnya dilewati.
-- Cek keberadaan fungsi lewat pg_proc, lalu jadwalkan (versi 3 argumen: nama, jadwal, perintah). Idempoten.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'cron' and p.proname = 'schedule')
     and not exists (select 1 from cron.job where jobname = 'prasara-notif') then
    perform cron.schedule('prasara-notif'::text, '* * * * *'::text, 'select public.notif_cron_kick()'::text);
  end if;
exception when others then raise notice 'jadwal pg_cron tidak dibuat: %', sqlerrm;
end $$;
