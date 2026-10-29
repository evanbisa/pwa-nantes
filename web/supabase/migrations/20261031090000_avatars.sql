-- Photo de profil (clients et restaurateurs), choisie dans la photothèque ou prise avec l'appareil.
--  1. profiles.avatar_path : chemin de la photo dans l'espace « avatars » (dossier = identifiant du compte).
--  2. Espace de stockage « avatars » : lecture publique (comme les photos des fiches), dépôt et suppression dans son
--     seul dossier ; JPEG, PNG ou WebP de 2 Mo au plus (le site envoie un JPEG carré de 512 px).
-- La suppression du compte efface le dossier (fonction serveur delete-account). Migration additive.

alter table public.profiles
  add column avatar_path text check (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
comment on column public.profiles.avatar_path is 'Photo de profil : chemin dans l''espace avatars (« compte/photo.jpg »), null sans photo.';
grant update (avatar_path) on public.profiles to authenticated;

-- La photo doit être rangée dans le dossier du compte (impossible de pointer vers celle d'un autre)
create or replace function private.profiles_avatar_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.avatar_path is not null and split_part(new.avatar_path, '/', 1) <> new.id::text then
    raise exception 'Photo de profil invalide' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_avatar_guard before insert or update of avatar_path on public.profiles
  for each row execute function private.profiles_avatar_guard();
revoke execute on function private.profiles_avatar_guard() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars : dépôt dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Supabase Storage ne supprime un fichier que si l'on peut aussi le lire (règle « select »)
create policy "avatars : lecture des siennes" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars : suppression des siennes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
