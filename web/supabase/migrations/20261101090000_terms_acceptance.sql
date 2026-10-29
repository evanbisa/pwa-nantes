-- Acceptation des conditions d'utilisation (et attestation « 15 ans ou plus ») gardée comme preuve :
--  profiles.terms_accepted_at (date, posée par la base) et profiles.terms_version (version acceptée).
--  - inscription par e-mail (client-signup) et restaurateurs : la version arrive avec l'inscription ;
--  - compte créé avec Google : accept_terms(version), appelée juste après, quand la case a été cochée.
-- Migration additive.

alter table public.profiles
  add column terms_accepted_at timestamptz,
  add column terms_version text check (terms_version ~ '^\d{4}-\d{2}-\d{2}$');
comment on column public.profiles.terms_accepted_at is 'Acceptation des CGU et attestation « 15 ans ou plus » (date posée par la base).';
comment on column public.profiles.terms_version is 'Version des CGU acceptée (date de la version, AAAA-MM-JJ).';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  terms text := case when meta ->> 'terms_version' ~ '^\d{4}-\d{2}-\d{2}$' then meta ->> 'terms_version' end;
begin
  insert into public.profiles (id, role, first_name, last_name, phone, gender, birth_year, terms_accepted_at, terms_version)
  values (
    new.id,
    -- toute autre valeur (ex. « admin ») donne un compte étudiant
    case when meta ->> 'role' = 'merchant' then 'merchant'::public.user_role else 'student'::public.user_role end,
    nullif(left(trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', split_part(coalesce(meta ->> 'full_name', meta ->> 'name', ''), ' ', 1))), 60), ''),
    nullif(left(trim(meta ->> 'last_name'), 60), ''),
    case when meta ->> 'phone' ~ '^\+?[0-9 .]{10,20}$' then meta ->> 'phone' end,
    case when meta ->> 'gender' in ('female', 'male', 'other') then meta ->> 'gender' end,
    private.valid_birth_year(meta ->> 'birth_year'),
    case when terms is not null then now() end,
    terms
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Compte créé avec Google : acceptation enregistrée par la personne connectée (date posée par la base)
create function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Acceptation invalide' using errcode = '22023';
  end if;
  update public.profiles set terms_accepted_at = now(), terms_version = p_version where id = (select auth.uid());
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
