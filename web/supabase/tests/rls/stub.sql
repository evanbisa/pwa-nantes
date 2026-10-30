-- Environnement Supabase simulé (rôles, auth, storage, realtime) pour tester la migration hors Supabase.
-- Reproduction minimale de l'environnement Supabase (rôles, auth, storage, realtime)
do $$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, raw_user_meta_data jsonb);
-- Sessions de connexion (comme Supabase Auth : refreshed_at sans fuseau, en heure UTC)
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp without time zone, not_after timestamptz,
  user_agent text, ip inet);
create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage; grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
-- Extension d'un nom de fichier (même définition que Supabase Storage)
create function storage.extension(name text) returns text language plpgsql immutable as $$
declare _parts text[] := string_to_array(name, '/');
begin return reverse(split_part(reverse(_parts[array_length(_parts, 1)]), '.', 1)); end $$;
grant execute on function storage.extension(text) to anon, authenticated, service_role;
create extension if not exists pgcrypto;
create publication supabase_realtime;
