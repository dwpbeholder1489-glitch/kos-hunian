-- Stub minimal Supabase untuk menjalankan migrasi & uji SQL di PostgreSQL lokal (BUKAN untuk produksi).
-- Dipakai supabase/tests/harness/run_bi.sh. Meniru: peran anon/authenticated/service_role, skema auth (uid/role/jwt/email dari
-- set_config('request.jwt.claims')), storage, cron, net, vault, ekstensi di skema extensions.
do $$ declare r text; begin
  foreach r in array array['anon', 'authenticated', 'supabase_admin', 'authenticator'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions; create extension pgcrypto schema extensions; create extension "uuid-ossp" schema extensions;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now(), email_confirmed_at timestamptz, last_sign_in_at timestamptz, phone text, deleted_at timestamptz, banned_until timestamptz, updated_at timestamptz default now(), encrypted_password text, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb->>'sub'),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true),''), (current_setting('request.jwt.claims', true)::jsonb->>'role')) $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt()->>'email' $$;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean default false, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz, path_tokens text[]);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name),'.',1)) $$;
create publication supabase_realtime;
create schema cron; create table cron.job(jobid serial, jobname text, schedule text, command text);
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values (a,b,c) returning jobid $$;
create function cron.unschedule(a text) returns boolean language sql as $$ delete from cron.job where jobname=a returning true $$;
create schema net; create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;
create schema vault;
grant usage on schema auth, extensions, storage to anon, authenticated, service_role;
do $$ begin execute format($f$alter database %I set search_path = public, extensions$f$, current_database()); end $$;
create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid, status text, factor_type text, created_at timestamptz default now());
create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now(), aal text);
create table auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid, provider text, identity_data jsonb);
