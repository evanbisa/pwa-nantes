-- =============================================================================
-- À EXÉCUTER UNE FOIS dans Supabase › SQL Editor › New query › coller › Run
-- (dernier morceau de la migration 20261024090000_analytics.sql ; les trois autres sont déjà appliqués en ligne).
--
-- Contenu : enregistrement des interactions des clients (track_visit) et « j'aime » des stories et des plats.
-- Les mots « delete » ci-dessous ne suppriment que le « j'aime » de la personne qui le retire, et l'historique
-- de plus de 90 jours : aucune table ni donnée existante n'est supprimée.
-- En attendant, le site continue de compter vues et clics avec l'ancien compteur.
-- =============================================================================
begin;

create function private.track_visit(p_merchant_id uuid, p_event text, p_ref uuid, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamp := now() at time zone 'Europe/Paris';
  v_day date := v_now::date;
  v_hour smallint := extract(hour from v_now)::smallint;
begin
  if p_event not in ('view', 'walk', 'car', 'phone', 'menu', 'photos', 'story', 'share', 'reviews', 'google', 'story_cta', 'offer') then
    raise exception 'Évènement inconnu : %', p_event using errcode = '22023';
  end if;
  -- fiche en ligne, et jamais les visites du restaurateur sur sa propre fiche
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open
                 and m.user_id is distinct from v_uid) then
    return;
  end if;
  if p_event in ('view', 'walk', 'car', 'phone', 'menu', 'photos', 'story') then
    perform private.track_merchant_event(p_merchant_id, p_event);
  end if;
  if p_event = 'view' then
    insert into public.merchant_view_hours as h (merchant_id, day, hour, views) values (p_merchant_id, v_day, v_hour, 1)
    on conflict (merchant_id, day, hour) do update set views = h.views + 1;
  end if;
  if v_uid is null then
    return;
  end if;
  -- provenance de la visite
  if p_event = 'view' and p_source in ('map', 'list', 'search', 'offers', 'story', 'notif', 'link') then
    insert into public.merchant_event_visitors (merchant_id, day, event, visitor_id)
    values (p_merchant_id, v_day, 'from_' || p_source, v_uid) on conflict do nothing;
  end if;
  if p_event in ('share', 'reviews', 'google', 'story_cta') then
    insert into public.merchant_event_visitors (merchant_id, day, event, visitor_id)
    values (p_merchant_id, v_day, p_event, v_uid) on conflict do nothing;
  end if;
  -- story vue / fiche ouverte depuis la story (story de ce restaurant uniquement)
  if p_event in ('story', 'story_cta') and p_ref is not null
     and exists (select 1 from public.stories s where s.id = p_ref and s.merchant_id = p_merchant_id) then
    insert into public.story_viewers as v (story_id, visitor_id, clicked) values (p_ref, v_uid, p_event = 'story_cta')
    on conflict (story_id, visitor_id) do update set clicked = v.clicked or excluded.clicked;
  end if;
  -- clic sur une offre de ce restaurant
  if p_event = 'offer' and p_ref is not null
     and exists (select 1 from public.promotions p where p.id = p_ref and p.merchant_id = p_merchant_id) then
    insert into public.promo_clicks (promo_id, visitor_id) values (p_ref, v_uid) on conflict do nothing;
  end if;
  -- ménage au fil de l'eau : 90 jours d'historique
  if random() < 0.02 then
    delete from public.merchant_event_visitors where day < v_day - 90;
    delete from public.merchant_view_hours where day < v_day - 90;
  end if;
end;
$$;

create function private.toggle_story_like(p_story_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stories s join public.merchants m on m.id = s.merchant_id
                 where s.id = p_story_id and s.expires_at > now() and m.status = 'published' and m.is_open and m.user_id <> v_uid) then
    raise exception 'Story indisponible.' using errcode = '42501';
  end if;
  delete from public.story_likes where story_id = p_story_id and user_id = v_uid;
  if found then return false; end if;
  insert into public.story_likes (story_id, user_id) values (p_story_id, v_uid);
  return true;
end;
$$;

-- « J'aime » un plat de la carte d'un restaurant en ligne (pas le sien) ; renvoie l'état final
create function private.toggle_dish_like(p_merchant_id uuid, p_dish text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_dish text := btrim(p_dish);
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchants m where m.id = p_merchant_id and m.status = 'published' and m.is_open and m.user_id <> v_uid
                 and exists (select 1 from jsonb_array_elements(m.menu_json) it where btrim(it ->> 'name') = v_dish)) then
    raise exception 'Plat introuvable.' using errcode = '42501';
  end if;
  delete from public.dish_likes where merchant_id = p_merchant_id and dish = v_dish and user_id = v_uid;
  if found then return false; end if;
  insert into public.dish_likes (merchant_id, dish, user_id) values (p_merchant_id, v_dish, v_uid);
  return true;
end;
$$;

create function public.track_visit(p_merchant_id uuid, p_event text, p_ref uuid default null, p_source text default null)
returns void language sql security invoker set search_path = '' as $$ select private.track_visit(p_merchant_id, p_event, p_ref, p_source) $$;
create function public.toggle_story_like(p_story_id uuid)
returns boolean language sql security invoker set search_path = '' as $$ select private.toggle_story_like(p_story_id) $$;
create function public.toggle_dish_like(p_merchant_id uuid, p_dish text)
returns boolean language sql security invoker set search_path = '' as $$ select private.toggle_dish_like(p_merchant_id, p_dish) $$;

revoke execute on function private.track_visit(uuid, text, uuid, text), private.toggle_story_like(uuid), private.toggle_dish_like(uuid, text),
  public.track_visit(uuid, text, uuid, text), public.toggle_story_like(uuid), public.toggle_dish_like(uuid, text) from public, anon, authenticated;
grant execute on function private.track_visit(uuid, text, uuid, text), public.track_visit(uuid, text, uuid, text) to anon, authenticated;
grant execute on function private.toggle_story_like(uuid), private.toggle_dish_like(uuid, text),
  public.toggle_story_like(uuid), public.toggle_dish_like(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
