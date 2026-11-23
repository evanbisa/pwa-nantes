-- Durée d'une story au choix du restaurateur : de 1 heure à 1 semaine (24 h si rien n'est choisi).
-- Depuis le site, l'heure de publication est celle de la base et la fin est ramenée dans [1 h, 7 jours] : impossible
-- de publier une story « éternelle » ou datée dans le passé. La durée ne se modifie pas après publication.
alter table public.stories drop constraint if exists stories_check2;
alter table public.stories add constraint stories_duration_check
  check (expires_at > created_at and expires_at <= created_at + interval '7 days');
grant insert (expires_at) on public.stories to authenticated;

-- Droits de l'appelant (pas « security definer ») : current_user est bien le rôle du site (anon / authenticated).
create or replace function private.stories_duration()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_at := now();
    new.expires_at := least(greatest(coalesce(new.expires_at, now() + interval '24 hours'), now() + interval '1 hour'), now() + interval '7 days');
  end if;
  return new;
end;
$$;
revoke all on function private.stories_duration() from public;
grant execute on function private.stories_duration() to anon, authenticated, service_role;
drop trigger if exists stories_duration on public.stories;
create trigger stories_duration before insert on public.stories for each row execute function private.stories_duration();
