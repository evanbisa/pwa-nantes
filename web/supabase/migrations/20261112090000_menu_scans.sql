-- Carte lue sur photo : le restaurateur photographie sa carte (1 à 5 photos) et la fonction serveur « menu-scan »
-- en tire la liste des plats (rubrique, nom, prix, détail), qu'il relit avant d'enregistrer sa fiche.
-- Les photos ne sont jamais stockées : seule une ligne de comptage est gardée ici, pour limiter le nombre de lectures
-- (15 par 24 heures et par fiche) ; elle est effacée après 30 jours par la fonction serveur « purge ».
-- Migration additive : aucune table ni donnée existante modifiée.
create table public.menu_scans (
  id          bigint generated always as identity primary key,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at  timestamptz not null default now(),
  images      smallint not null check (images between 1 and 5),
  items       smallint check (items between 0 and 80)            -- plats lus (vide si la lecture a échoué)
);
create index menu_scans_merchant_idx on public.menu_scans (merchant_id, created_at desc);
create index menu_scans_created_idx on public.menu_scans (created_at);
comment on table public.menu_scans is 'Lectures de carte sur photo (comptage seulement, sans les photos). Effacées après 30 jours.';
revoke all on public.menu_scans from anon, authenticated;
grant all on public.menu_scans to service_role;
alter table public.menu_scans enable row level security;
create policy "menu_scans : aucun accès direct" on public.menu_scans for all to anon, authenticated using (false) with check (false);
