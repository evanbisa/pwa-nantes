-- Catégories, infos pratiques et liens des restaurants (audit du 25 novembre 2026).

-- 1. Nouvelles catégories : un sushi, un tacos, une crêperie… ne finissent plus dans « Autres »
alter type public.merchant_category add value if not exists 'asian';
alter type public.merchant_category add value if not exists 'tacos';
alter type public.merchant_category add value if not exists 'creperie';
alter type public.merchant_category add value if not exists 'bakery';
alter type public.merchant_category add value if not exists 'cafe';
alter type public.merchant_category add value if not exists 'bar';
alter type public.merchant_category add value if not exists 'world';
alter type public.merchant_category add value if not exists 'traditional';

-- 2. Infos pratiques (cases cochées par le restaurateur) : icônes sur la fiche et filtres de la carte
alter table public.merchants
  add column if not exists amenities text[] not null default '{}';
alter table public.merchants
  add constraint merchants_amenities_check
    check (cardinality(amenities) <= 12 and amenities <@ array['dine_in', 'takeaway', 'delivery', 'terrace', 'vegetarian', 'vegan',
                                                               'halal', 'gluten_free', 'card', 'wheelchair']::text[]);

-- 3. Liens du restaurant : Instagram, site internet, commande en ligne / livraison (adresses https uniquement)
create or replace function private.valid_links(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (select 1 from jsonb_object_keys(p) k where k not in ('instagram', 'website', 'order'))
     and not exists (select 1 from jsonb_each(p) e(k, v)
                     where jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 300
                        or (v #>> '{}') !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^\s<>"'']*)?$')
$$;
revoke all on function private.valid_links(jsonb) from public;
grant execute on function private.valid_links(jsonb) to anon, authenticated, service_role;
alter table public.merchants
  add column if not exists links jsonb not null default '{}'::jsonb;
alter table public.merchants
  add constraint merchants_links_check check (private.valid_links(links));

grant select (amenities, links) on public.merchants to anon, authenticated;
grant update (amenities, links) on public.merchants to authenticated;

-- 4. Statistiques : clics sur les liens du restaurant (une fois par personne et par jour), comme les partages.
--    Les deux fonctions existantes sont reprises telles quelles avec ce seul ajout (contrôlé : erreur si le texte attendu
--    n'est pas trouvé).
do $$
declare
  d text;
  n text;
begin
  select pg_get_functiondef('private.track_visit(uuid,text,uuid,text)'::regprocedure) into d;
  n := replace(d, $a$'reviews', 'google', 'story_cta', 'offer') then$a$, $a$'reviews', 'google', 'story_cta', 'offer', 'link') then$a$);
  n := replace(n, $a$if p_event in ('share', 'reviews', 'google', 'story_cta') then$a$, $a$if p_event in ('share', 'reviews', 'google', 'story_cta', 'link') then$a$);
  if n = d or position($a$'offer', 'link'$a$ in n) = 0 or position($a$'story_cta', 'link') then$a$ in n) = 0 then
    raise exception 'track_visit : texte attendu introuvable';
  end if;
  execute n;

  select pg_get_functiondef('private.merchant_analytics(uuid,integer)'::regprocedure) into d;
  n := replace(d, $a$'google', coalesce((select n from ev where event = 'google'), 0),$a$,
               $a$'google', coalesce((select n from ev where event = 'google'), 0),
      'links', coalesce((select n from ev where event = 'link'), 0),$a$);
  if n = d then
    raise exception 'merchant_analytics : texte attendu introuvable';
  end if;
  execute n;
end;
$$;
