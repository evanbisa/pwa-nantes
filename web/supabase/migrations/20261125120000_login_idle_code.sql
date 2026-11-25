-- Sécurité : après 14 jours sans utiliser le site, la connexion par mot de passe demande en plus un code envoyé par
-- e-mail (et une session restée ouverte 14 jours sans servir aussi). Le site appelle :
--   public.login_needs_code() : vrai si le compte n'a pas servi depuis 14 jours ET que la session n'a pas été ouverte,
--     dans l'heure, autrement que par mot de passe (code par e-mail, Google) ;
--   public.touch_activity()   : note l'utilisation du site (refusé tant qu'un code est exigé).
create table if not exists private.user_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table private.user_activity enable row level security;
revoke all on private.user_activity from public, anon, authenticated;

-- Comptes existants : dernière connexion connue (sinon date de création)
insert into private.user_activity (user_id, last_active_at)
select id, coalesce(last_sign_in_at, created_at, now()) from auth.users
on conflict (user_id) do nothing;

create or replace function public.login_needs_code()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
      select coalesce(a.last_active_at, u.created_at) < now() - interval '14 days'
      from auth.users u left join private.user_activity a on a.user_id = u.id
      where u.id = auth.uid()), false)
    and not exists (
      select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
      where e ->> 'method' <> 'password'
        and to_timestamp((e ->> 'timestamp')::bigint) > now() - interval '1 hour');
$$;

create or replace function public.touch_activity()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.login_needs_code() then return false; end if;
  insert into private.user_activity (user_id, last_active_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_active_at = excluded.last_active_at
    where private.user_activity.last_active_at < now() - interval '5 minutes';
  return true;
end $$;

revoke all on function public.login_needs_code() from public, anon;
revoke all on function public.touch_activity() from public, anon;
grant execute on function public.login_needs_code() to authenticated;
grant execute on function public.touch_activity() to authenticated;
